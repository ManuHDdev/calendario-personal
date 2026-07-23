## ADDED Requirements

### Requirement: Custom event color selection
Beyond the existing 12 preset swatches, the event form SHALL offer a custom color option that opens a draggable color picker and accepts a hex code typed directly (e.g. `#123abc`). Selecting either a preset or a custom color SHALL set the same underlying `color` form field.

#### Scenario: Picking a custom color via the picker
- **WHEN** the user opens the custom color picker and drags to select a color
- **THEN** the event's color field updates to the selected color's hex value

#### Scenario: Typing a hex code directly
- **WHEN** the user types a valid hex code (e.g. `#123abc`) into the custom color input
- **THEN** the event's color field is set to that exact hex value

### Requirement: Clickable links in event description
In the read-only event detail view, any `http://`, `https://`, or `www.`-prefixed URL found within the event's `descripcion` SHALL render as a clickable link that opens in a new tab. The edit form's description textarea SHALL remain plain text — linkification applies only to the detail view's rendering.

#### Scenario: Viewing an event with a URL in its description
- **WHEN** a user opens the detail view of an event whose description contains `https://example.com`
- **THEN** that URL is rendered as a clickable link opening `https://example.com` in a new tab

#### Scenario: Editing an event does not linkify the textarea
- **WHEN** a user opens the edit form for an event whose description contains a URL
- **THEN** the description textarea shows the URL as plain editable text, not as a rendered link
