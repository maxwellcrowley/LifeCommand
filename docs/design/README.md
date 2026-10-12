# Warm content identity

Central brand colors remain in `src/theme/palettes.ts`: warm canvas #FAF6EF, white surfaces, espresso #332B27, peach #F3DDD1, reference terracotta #B94F35. The light interactive terracotta is darker (#8F3927) for contrast. Dark uses warm charcoal/espresso, cream text and brighter terracotta. Existing font stack and text scaling remain; startup adds no font dependency.

`sectionAppearance(color, surface, text)` is the single content-color resolver. It uses deterministic opaque sRGB interpolation towards the actual theme surface, then measured WCAG luminance constraints. This is a documented equivalent to a perceptual adjustment pipeline, not arbitrary alpha compositing. Section tint is stronger than nested project tint; primary, outlined secondary, border, icon, selected, hover/pressed, disabled and focus roles are separate. Text is constrained to 4.5:1, meaningful control/border roles to 3:1. Tests cover red/orange/yellow/green/teal/blue/purple/gray/near-white/near-black in both themes.

`ProjectScope` resolves **only** the existing `Project.sectionId`. Missing or ambiguous links use neutral #808080; task membership does not create a competing association. `ProjectHeader` and shared `Action` consume that context. Global actions retain terracotta; destructive actions, priority pills and calendar-source colors keep their semantic/source identity. Section and project colors never change the saved section hex.

Task surfaces remain neutral. Today, Calendar, Review and project task lists share TaskList headings; Projects/planner/editor previews reuse the same scope/header. Project/task editors use contextual buttons. Ambient uses a contrast-adjusted section edge with existing textual priority/status cues, not extra saturated cards.

Layout vocabulary: 44 px minimum actions, wrapping labels, 8–18 px internal gaps, 10–12 px controls, 20 px cards, minimal shadows. Settings dialogs are width constrained on desktop, full-height on phones, with only the body scrolling and a fixed footer. Do not use color alone for selection, status or priority.

See `provisional-concepts.png` and `../product/BRAND_PRELIMINARY_SCREEN.md` for unselected logo concepts. They are documentation only, not application assets.
