import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palettes } from '../src/theme/palettes';
import { contrastRatio, sectionAppearance } from '../src/domain/sectionAppearance';

test('quiet task pills preserve semantic text contrast in both themes', () => {
  for (const palette of Object.values(palettes)) {
    for (const color of [palette.danger, palette.warning, palette.success]) {
      const tone = sectionAppearance(color, palette.surface, palette.text);
      assert.ok(contrastRatio(tone.icon, tone.background) >= 4.5);
    }
  }
});

test('subordinate project headings and outlined section actions remain readable on calm surfaces', () => {
  for (const palette of Object.values(palettes)) for (const color of ['#FF0000','#FF8800','#FFFF00','#00FF00','#008080','#0000FF','#800080','#808080','#FEFEFE','#010101']) {
    const appearance = sectionAppearance(color, palette.surface, palette.text);
    assert.ok(contrastRatio(appearance.secondaryText, palette.surface) >= 4.5, color);
    assert.ok(contrastRatio(appearance.sectionForeground, appearance.background) >= 4.5, color);
    assert.ok(contrastRatio(appearance.focus, palette.surface) >= 3, color);
  }
});
