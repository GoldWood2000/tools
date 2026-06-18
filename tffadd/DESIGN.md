---
name: TTF Font Merge Console
description: A precise local console for merging Chinese TTF font characters with designer-friendly file handling.
colors:
  ink: "#161616"
  muted: "#6b6f72"
  line: "#d6dad5"
  paper: "#f6f7f2"
  panel: "#ffffff"
  panel-strong: "#f0f3ee"
  accent: "#d4522f"
  accent-dark: "#a9331d"
  teal: "#126c68"
  teal-soft: "#d9ebe7"
  amber: "#f1b84b"
  log-bg: "#111312"
  log-text: "#e8f1ea"
typography:
  display:
    fontFamily: "WorkbenchTitle, PingFang SC, sans-serif"
    fontSize: "42px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0"
  mono:
    fontFamily: "SFMono-Regular, Cascadia Code, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  sm: "8px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "10px"
  md: "14px"
  lg: "16px"
  xl: "18px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  input:
    backgroundColor: "#fbfcf8"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "42px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "18px"
---

# Design System: TTF Font Merge Console

## 1. Overview

**Creative North Star: "The Studio Workbench"**

This system should feel like a carefully arranged local workbench for designers and frontend engineers: compact, tactile, and technically trustworthy. The UI is a product surface, not a marketing page; it should help users choose files, inspect character coverage, run a merge, and download the result without wondering what will happen next.

The aesthetic is minimal and stable with a stronger design point of view than a plain backend panel. It uses restrained color, visible material boundaries, and a soft grid field to keep the tool from feeling like a generic enterprise admin dashboard.

**Key Characteristics:**
- Focused three-step workflow with source/target files, character input, logs, and output.
- Restrained warm-neutral surfaces with rust and teal as functional accents.
- Compact controls, 8px radii, clear borders, and explicit file metadata.
- Terminal-style logs preserved as a confidence surface, not decoration.

## 2. Colors

The palette is restrained: neutral work surfaces carry the interface, with rust for primary action and teal for status, preview, and confirmation.

### Primary
- **Workbench Rust** (#d4522f): Primary merge action and decisive accents.
- **Pressed Rust** (#a9331d): Labels, high-emphasis small text, and error-adjacent emphasis.

### Secondary
- **Instrument Teal** (#126c68): Online status, download actions, focus border, and success-adjacent states.
- **Teal Wash** (#d9ebe7): Sample chips and completed state backgrounds.

### Tertiary
- **Caution Amber** (#f1b84b): Running and pending states only.

### Neutral
- **Carbon Ink** (#161616): Main text, secondary button background, and strong UI anchors.
- **Tool Gray** (#6b6f72): Metadata and secondary descriptive text.
- **Rule Line** (#d6dad5): Borders and separators.
- **Bench Paper** (#f6f7f2): Page background.
- **Panel White** (#ffffff): Primary panels and controls.
- **Panel Low** (#f0f3ee): Nested fields, metric cells, and quiet interior surfaces.
- **Log Black** (#111312): Console log background.
- **Log Mist** (#e8f1ea): Console log text.

### Named Rules

**The Functional Accent Rule.** Rust and teal exist for action and state. Do not use them as decorative fills on inactive content.

## 3. Typography

**Display Font:** WorkbenchTitle with PingFang SC fallback  
**Body Font:** Avenir Next with PingFang SC and Microsoft YaHei fallbacks  
**Label/Mono Font:** SFMono-Regular / Cascadia Code / Consolas for logs

**Character:** The title font adds a precise display note for the tool identity, while the product UI stays on a familiar sans stack. Labels are compact and strong; logs retain a real terminal feel.

### Hierarchy
- **Display** (700, 42px, 1.1): Page title only.
- **Headline** (700, 22px, 1.2): Panel titles and major regions.
- **Title** (700-900, 15-18px): File names, metric values, and compact item headings.
- **Body** (400, 14px, 1.55): Supporting UI text, metadata, result messages.
- **Label** (800-900, 12px, uppercase where already used): Field labels and workflow markers.
- **Mono** (400, 13px, 1.55): Terminal output and command logs.

### Named Rules

**The Display Restraint Rule.** Use WorkbenchTitle only for the product title or large font previews. Never use it for form labels, buttons, logs, or metadata.

## 4. Elevation

The system uses a hybrid of tonal layering and one ambient panel shadow. Depth should make the work areas legible, not create a floating-card dashboard.

### Shadow Vocabulary
- **Panel Ambient** (`0 18px 50px rgba(21, 25, 23, 0.12)`): Main panels only.
- **Interactive Lift** (`0 8px 22px rgba(22, 22, 22, 0.12)`): Hover feedback for buttons, chips, and links.
- **Inset Field** (`inset 0 1px 0 rgba(0, 0, 0, 0.03)`): Large textarea only.

### Named Rules

**The Workbench Surface Rule.** Use borders and tonal layers first; use shadows only for primary panels or short interaction feedback.

## 5. Components

### Buttons
- **Shape:** Compact rounded rectangle (8px).
- **Primary:** Workbench Rust background, white text, 44px height, strong 900 weight.
- **Secondary:** Carbon Ink background, white text, same size and weight as primary.
- **Ghost:** White background, Carbon Ink text, Rule Line border.
- **Hover / Focus:** Hover lifts by 1px with Interactive Lift. Focus uses a teal ring on form controls; buttons should keep a visible focus-visible treatment when extended.

### Chips
- **Style:** Teal Wash background, deep teal text, 34px minimum height, 14px bold text.
- **State:** Used for quick text samples, not persistent filters.

### Cards / Containers
- **Corner Style:** 8px for all panels and field blocks.
- **Background:** Panel White for main panels; Panel Low for interior fields and file items.
- **Shadow Strategy:** Main panels may use Panel Ambient; nested field blocks should stay flat.
- **Border:** Rule Line border on all panels and contained controls.
- **Internal Padding:** 18px for panels, 14px for field blocks, 12px for list items.

### Inputs / Fields
- **Style:** 42px minimum height, 8px radius, #fbfcf8 fill, Rule Line or #c8cec8 border.
- **Focus:** Border shifts to Instrument Teal with a soft teal ring.
- **Disabled:** Opacity reduction only when paired with disabled cursor; avoid low-contrast text.
- **Textarea:** Large 24px character input with generous line-height and inset field highlight.

### Navigation
- There is no global navigation. The primary structure is the workflow grid: choose fonts, input characters, inspect logs, download output.

### Signature Component

**Preview Box:** A bordered 8px panel with subtle vertical measuring lines, used to preview generated fonts. It should feel like a typographic specimen surface, not a decorative illustration.

## 6. Do's and Don'ts

### Do:
- **Do** keep the source, target, uploaded, and output file scopes visible in labels and metadata.
- **Do** keep logs readable with Log Black and Log Mist; the log is part of user trust.
- **Do** use rust for the primary merge action and teal for status, download, and focus.
- **Do** keep Chinese strings and long font filenames wrapping inside their containers.
- **Do** preserve keyboard focus, disabled, loading, failed, and completed states.

### Don't:
- **Don't** make it look like a generic enterprise backend system.
- **Don't** add a marketing hero, oversized pitch copy, or decorative feature sections.
- **Don't** use dark-mode terminal cosplay as the default visual identity.
- **Don't** use side-stripe borders, gradient text, glassmorphism, or repeated identical card grids.
- **Don't** use the display font inside labels, buttons, metadata, or logs.
