import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isFromOwner,
  pickBestPhotoFileId,
  HELP_MESSAGE,
  parseEditCommand,
  applyEditToDraft,
  formatDraftMessage,
  handlePhotoMessage,
  handleProfileSelection,
  handleEditarCommand,
  handleEnviarCommand,
  handleDescartarCommand,
} from './bot';
import type { DraftGasto } from '../types/gasto';

describe('isFromOwner', () => {
  it('accepts a message from the configured owner chat id', () => {
    expect(isFromOwner(123456789, '123456789')).toBe(true);
  });

  it('rejects a message from any other chat id', () => {
    expect(isFromOwner(999999999, '123456789')).toBe(false);
  });

  it('rejects when the owner chat id is not configured', () => {
    expect(isFromOwner(123456789, undefined)).toBe(false);
  });

  it('rejects when the incoming chat id is missing', () => {
    expect(isFromOwner(undefined, '123456789')).toBe(false);
  });

  it('compares numeric and string chat ids equivalently', () => {
    expect(isFromOwner('123456789', '123456789')).toBe(true);
  });
});

describe('pickBestPhotoFileId', () => {
  it('picks the last (highest-resolution) size Telegram sends', () => {
    const photos = [{ file_id: 'small' }, { file_id: 'medium' }, { file_id: 'large' }];
    expect(pickBestPhotoFileId(photos)).toBe('large');
  });

  it('returns undefined for an empty photo list', () => {
    expect(pickBestPhotoFileId([])).toBeUndefined();
  });
});

describe('HELP_MESSAGE', () => {
  it('documents how to use the bot and its commands', () => {
    expect(HELP_MESSAGE).toContain('/start');
    expect(HELP_MESSAGE).toContain('/help');
    expect(HELP_MESSAGE).toMatch(/ticket/i);
    expect(HELP_MESSAGE).toMatch(/banco/i);
  });

  it('documents the new /editar, /enviar and /descartar commands', () => {
    expect(HELP_MESSAGE).toContain('/editar');
    expect(HELP_MESSAGE).toContain('/enviar');
    expect(HELP_MESSAGE).toContain('/descartar');
  });
});

describe('parseEditCommand', () => {
  it('parses field and value from a well-formed /editar command', () => {
    expect(parseEditCommand('/editar importe 12,50')).toEqual({ campo: 'importe', valor: '12,50' });
  });

  it('keeps spaces inside the value (e.g. a comercio name with spaces)', () => {
    expect(parseEditCommand('/editar comercio Mercadona Centro')).toEqual({
      campo: 'comercio',
      valor: 'Mercadona Centro',
    });
  });

  it('tolerates a bot username suffix on the command', () => {
    expect(parseEditCommand('/editar@MyBot fecha 2026-08-03')).toEqual({ campo: 'fecha', valor: '2026-08-03' });
  });

  it('returns null when there are not enough arguments', () => {
    expect(parseEditCommand('/editar importe')).toBeNull();
    expect(parseEditCommand('/editar')).toBeNull();
  });
});

describe('applyEditToDraft', () => {
  const draft: DraftGasto = { importe: 10, fecha: '2026-01-01', comercio: 'Original' };

  describe('importe', () => {
    it('accepts a dot-decimal positive number', () => {
      const result = applyEditToDraft(draft, 'importe', '12.5');
      expect(result).toEqual({ ok: true, draft: { ...draft, importe: 12.5 } });
    });

    it('accepts a comma-decimal positive number', () => {
      const result = applyEditToDraft(draft, 'importe', '12,50');
      expect(result).toEqual({ ok: true, draft: { ...draft, importe: 12.5 } });
    });

    it('rejects zero', () => {
      const result = applyEditToDraft(draft, 'importe', '0');
      expect(result.ok).toBe(false);
    });

    it('rejects a negative number', () => {
      const result = applyEditToDraft(draft, 'importe', '-5');
      expect(result.ok).toBe(false);
    });

    it('rejects a non-numeric value', () => {
      const result = applyEditToDraft(draft, 'importe', 'abc');
      expect(result.ok).toBe(false);
    });
  });

  describe('fecha', () => {
    it('accepts YYYY-MM-DD', () => {
      const result = applyEditToDraft(draft, 'fecha', '2026-08-03');
      expect(result).toEqual({ ok: true, draft: { ...draft, fecha: '2026-08-03' } });
    });

    it('rejects DD/MM/YYYY', () => {
      const result = applyEditToDraft(draft, 'fecha', '03/08/2026');
      expect(result.ok).toBe(false);
    });

    it('rejects an invalid-looking value', () => {
      const result = applyEditToDraft(draft, 'fecha', 'mañana');
      expect(result.ok).toBe(false);
    });
  });

  describe('comercio', () => {
    it('accepts and trims a non-empty value', () => {
      const result = applyEditToDraft(draft, 'comercio', '  Mercadona  ');
      expect(result).toEqual({ ok: true, draft: { ...draft, comercio: 'Mercadona' } });
    });

    it('rejects an empty/whitespace-only value', () => {
      const result = applyEditToDraft(draft, 'comercio', '   ');
      expect(result.ok).toBe(false);
    });
  });

  it('rejects an unknown field without mutating the draft', () => {
    const result = applyEditToDraft(draft, 'categoria', 'Ocio');
    expect(result.ok).toBe(false);
  });
});

describe('formatDraftMessage', () => {
  it('marks the draft as not yet saved', () => {
    const draft: DraftGasto = { importe: 12.5, fecha: '2026-08-03', comercio: 'Mercadona' };
    const message = formatDraftMessage(draft, { saved: false });
    expect(message).toMatch(/no.*guardad/i);
    expect(message).toContain('12.50');
    expect(message).toContain('2026-08-03');
    expect(message).toContain('Mercadona');
  });

  it('marks the draft as saved and pending review in the app', () => {
    const draft: DraftGasto = { importe: 12.5, fecha: '2026-08-03', comercio: 'Mercadona' };
    const message = formatDraftMessage(draft, { saved: true });
    expect(message).toMatch(/guardado/i);
    expect(message).toMatch(/pendiente de revisión en la app/i);
  });
});

const mockParseImage = vi.fn();
const mockPersistGasto = vi.fn();
vi.mock('../ocr/pipeline', () => ({
  parseImage: (...args: unknown[]) => mockParseImage(...args),
  persistGasto: (...args: unknown[]) => mockPersistGasto(...args),
}));

function fakeReplyCtx() {
  return { chat: { id: 42 }, reply: vi.fn().mockResolvedValue(undefined) };
}

describe('handlePhotoMessage / handleProfileSelection (deferred persistence flow)', () => {
  beforeEach(() => {
    mockParseImage.mockReset();
    mockPersistGasto.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) }));
  });

  it('stashes the file_id and asks for the profile on a new photo', async () => {
    const ctx = { ...fakeReplyCtx(), message: { photo: [{ file_id: 'abc' }] } };
    await handlePhotoMessage(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith('¿Qué tipo de imagen es?', expect.anything());
  });

  it('calls parseImage (not the old auto-persisting pipeline) once a profile is chosen, and does not persist anything', async () => {
    const draft: DraftGasto = { importe: 7.5, fecha: '2026-08-03', comercio: 'Bar Paco' };
    mockParseImage.mockResolvedValue(draft);

    const photoCtx = { ...fakeReplyCtx(), message: { photo: [{ file_id: 'file-1' }] } };
    await handlePhotoMessage(photoCtx as any);

    const actionCtx = {
      ...fakeReplyCtx(),
      match: ['perfil:ticket', 'ticket'] as unknown as RegExpExecArray,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      telegram: { getFileLink: vi.fn().mockResolvedValue({ toString: () => 'https://example.com/file-1' }) },
    };
    await handleProfileSelection(actionCtx as any);

    expect(mockParseImage).toHaveBeenCalledWith(expect.any(Buffer), 'ticket');
    expect(mockPersistGasto).not.toHaveBeenCalled();
    expect(actionCtx.reply).toHaveBeenCalledWith(expect.stringMatching(/no.*guardad/i));
  });
});

describe('handleEditarCommand', () => {
  beforeEach(() => {
    mockParseImage.mockReset();
    mockPersistGasto.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) }));
  });

  async function seedPendingDraft(chatId: number, draft: DraftGasto) {
    mockParseImage.mockResolvedValueOnce(draft);
    const photoCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined), message: { photo: [{ file_id: 'f' }] } };
    await handlePhotoMessage(photoCtx as any);
    const actionCtx = {
      chat: { id: chatId },
      reply: vi.fn().mockResolvedValue(undefined),
      match: ['perfil:ticket', 'ticket'] as unknown as RegExpExecArray,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      telegram: { getFileLink: vi.fn().mockResolvedValue({ toString: () => 'https://example.com/f' }) },
    };
    await handleProfileSelection(actionCtx as any);
  }

  it('replies with an error and does not change the draft when the value is invalid', async () => {
    const chatId = 100;
    await seedPendingDraft(chatId, { importe: 1, fecha: '2026-01-01', comercio: 'X' });

    const ctx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined), message: { text: '/editar importe abc' } };
    await handleEditarCommand(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('⚠️'));

    // The pending draft must be unchanged: sending /enviar should still persist the original importe.
    const enviarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    mockPersistGasto.mockResolvedValue({});
    await handleEnviarCommand(enviarCtx as any);
    expect(mockPersistGasto).toHaveBeenCalledWith(
      expect.objectContaining({ importe: 1 }),
      'ticket',
      expect.any(Buffer),
    );
  });

  it('updates the field and confirms when the value is valid', async () => {
    const chatId = 101;
    await seedPendingDraft(chatId, { importe: 1, fecha: '2026-01-01', comercio: 'X' });

    const ctx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined), message: { text: '/editar importe 25.90' } };
    await handleEditarCommand(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('actualizado'));

    const enviarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    mockPersistGasto.mockResolvedValue({});
    await handleEnviarCommand(enviarCtx as any);
    expect(mockPersistGasto).toHaveBeenCalledWith(
      expect.objectContaining({ importe: 25.9 }),
      'ticket',
      expect.any(Buffer),
    );
  });

  it('replies that there is nothing pending when there is no draft for this chat', async () => {
    const ctx = { chat: { id: 9999 }, reply: vi.fn().mockResolvedValue(undefined), message: { text: '/editar importe 5' } };
    await handleEditarCommand(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/no hay ningún borrador pendiente/i));
  });
});

describe('handleEnviarCommand', () => {
  beforeEach(() => {
    mockParseImage.mockReset();
    mockPersistGasto.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) }));
  });

  it('replies that there is nothing pending when there is no draft for this chat', async () => {
    const ctx = { chat: { id: 8888 }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleEnviarCommand(ctx as any);
    expect(mockPersistGasto).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/no hay ningún borrador pendiente/i));
  });

  it('persists the pending draft, clears it, and confirms it is pending review in the app', async () => {
    const chatId = 200;
    mockParseImage.mockResolvedValueOnce({ importe: 3, fecha: '2026-01-01', comercio: 'Y' });
    const photoCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined), message: { photo: [{ file_id: 'f' }] } };
    await handlePhotoMessage(photoCtx as any);
    const actionCtx = {
      chat: { id: chatId },
      reply: vi.fn().mockResolvedValue(undefined),
      match: ['perfil:banco', 'banco'] as unknown as RegExpExecArray,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      telegram: { getFileLink: vi.fn().mockResolvedValue({ toString: () => 'https://example.com/f' }) },
    };
    await handleProfileSelection(actionCtx as any);

    mockPersistGasto.mockResolvedValue({ id: 'saved-1' });
    const enviarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleEnviarCommand(enviarCtx as any);

    expect(mockPersistGasto).toHaveBeenCalledWith(
      expect.objectContaining({ importe: 3 }),
      'banco',
      expect.any(Buffer),
    );
    expect(enviarCtx.reply).toHaveBeenCalledWith(expect.stringMatching(/pendiente de revisión en la app/i));

    // Sending /enviar again must find nothing pending — the draft was cleared.
    const secondEnviarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleEnviarCommand(secondEnviarCtx as any);
    expect(secondEnviarCtx.reply).toHaveBeenCalledWith(expect.stringMatching(/no hay ningún borrador pendiente/i));
  });
});

describe('handleDescartarCommand', () => {
  beforeEach(() => {
    mockParseImage.mockReset();
    mockPersistGasto.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(4) }));
  });

  it('replies that there is nothing pending when there is no draft for this chat', async () => {
    const ctx = { chat: { id: 7777 }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleDescartarCommand(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/no hay ningún borrador pendiente/i));
  });

  it('discards the pending draft without persisting it', async () => {
    const chatId = 300;
    mockParseImage.mockResolvedValueOnce({ importe: 4, fecha: '2026-01-01', comercio: 'Z' });
    const photoCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined), message: { photo: [{ file_id: 'f' }] } };
    await handlePhotoMessage(photoCtx as any);
    const actionCtx = {
      chat: { id: chatId },
      reply: vi.fn().mockResolvedValue(undefined),
      match: ['perfil:ticket', 'ticket'] as unknown as RegExpExecArray,
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
      telegram: { getFileLink: vi.fn().mockResolvedValue({ toString: () => 'https://example.com/f' }) },
    };
    await handleProfileSelection(actionCtx as any);

    const descartarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleDescartarCommand(descartarCtx as any);
    expect(descartarCtx.reply).toHaveBeenCalledWith(expect.stringMatching(/descartado/i));
    expect(mockPersistGasto).not.toHaveBeenCalled();

    // Nothing left pending afterwards.
    const enviarCtx = { chat: { id: chatId }, reply: vi.fn().mockResolvedValue(undefined) };
    await handleEnviarCommand(enviarCtx as any);
    expect(enviarCtx.reply).toHaveBeenCalledWith(expect.stringMatching(/no hay ningún borrador pendiente/i));
  });
});
