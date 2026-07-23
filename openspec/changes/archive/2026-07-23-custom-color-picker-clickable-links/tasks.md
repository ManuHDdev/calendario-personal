## 1. Color picker

- [x] 1.1 Add `ngx-color-picker` as a dependency (`npm install ngx-color-picker`) and verify it installs cleanly against Angular 20.3
- [x] 1.2 Attach `ngx-color-picker`'s directive to the existing hex input (`formControlName="color"`) in `evento-form`'s template, instead of adding a separate button (the hex input already existed — discovered during implementation)
- [x] 1.3 Configure the picker to read/write the same `color` form control the input already binds to, so opening the wheel and typing a hex code both update the same value
- [x] 1.4 Confirm typing a hex code directly into the existing input still works unchanged
- [x] 1.5 Unit test: selecting a custom color updates the form's `color` control
- [x] 1.6 Unit test: typing a hex code updates the form's `color` control

## 2. Clickable links in description

- [x] 2.1 Create `linkify` pipe: HTML-escape input text, then wrap `http(s)://`/`www.`-prefixed URL matches in `<a target="_blank" rel="noopener noreferrer">`, returning `SafeHtml` via `DomSanitizer`
- [x] 2.2 Exclude trailing punctuation (`.`, `,`, `)`) from URL matches
- [x] 2.3 Apply the pipe to `descripcion` in `evento-detalle`'s template via `[innerHTML]`
- [x] 2.4 Confirm `evento-form`'s textarea is untouched (still plain text, no pipe applied)
- [x] 2.5 Unit test: description with a URL renders a clickable `<a>` tag with the correct `href`
- [x] 2.6 Unit test: description with no URL renders unchanged, HTML-escaped
- [x] 2.7 Unit test: description containing `<script>` or other HTML is escaped, not executed

## 3. Verification

- [x] 3.1 Run `ng build` to confirm no compilation errors from the new dependency (found and fixed 2 real errors: `ColorPickerModule` doesn't exist in ngx-color-picker 20.x — the correct import is `ColorPickerDirective`; and `[colorPicker]` needs a non-nullable string, fixed with `|| '#0071e3'` fallback)
- [x] 3.2 Run existing `evento-form.spec.ts` and `evento-detalle.spec.ts`, plus the new `linkify.pipe.spec.ts` — 14/14 SUCCESS, no regressions (found and fixed one more real error along the way: `SecurityContext` moved from `@angular/platform-browser` to `@angular/core` in this Angular version)
- [x] 3.3 Manual check in the browser: verified end-to-end against the real local stack (Postgres+Keycloak+backend+frontend). Opened the color picker (real `<color-picker>` element with saturation/hue area + hex input), typed `#123abc`, confirmed it propagated to the form, saved the event, and confirmed via the backend's own API response that `color: "#123abc"` persisted. Created an event with description `Mirar https://example.com para mas info.` and confirmed the detail view renders `<a href="https://example.com/" target="_blank" rel="noopener noreferrer">` with the trailing period correctly excluded. Test event deleted afterward.
