# Product

## Register

product

## Users

Local designers and frontend engineers use this tool while preparing Chinese TTF font assets for product interfaces, previews, and delivery. They are usually working on a focused asset task: choose a source font, choose a target font, add missing characters, inspect the terminal-style result, and download the generated font without context switching back to shell commands.

## Product Purpose

This product turns the existing command-line font merge workflow into a local visual console. Success means users can safely replace source and target font files, check character availability, run the merge, understand failures, and download the output font with confidence. The interface should make the filesystem organization and merge status visible without feeling like a generic admin dashboard.

## Brand Personality

Minimal, stable, design-aware. The product should feel like a precise studio utility: quiet enough for repeated technical work, but considered enough that designers trust it as part of their craft workflow.

## Anti-references

Do not make it look like a generic enterprise backend system. Avoid dense gray admin tables, oversized dashboard chrome, decorative marketing sections, and loud novelty effects that slow down the task. Avoid dark-mode terminal cosplay as the default visual identity.

## Design Principles

1. Put the workflow first: source, target, characters, status, output.
2. Preserve technical confidence: logs and file metadata should be explicit, readable, and close to the action.
3. Use design craft sparingly: enough visual distinction to feel intentional, never enough to distract.
4. Make file locations legible: the source, target, upload, and output folders are part of the mental model.
5. Keep repeat use calm: controls should be predictable, compact, and forgiving.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. The UI should remain fully usable with keyboard navigation, visible focus states, and clear disabled/error states. Motion should be short, state-based, and respect reduced-motion preferences. Chinese labels and long font filenames must wrap without overflow.
