// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The AudioWorklet scripts are vendored into public/js-synthesizer by setup-js-synthesizer.sh
// and loaded by URL. If they drift from the npm package, the worklet registers a different
// processor name and the studio's audio engine fails to start.
const root = path.resolve(__dirname, '../../../../..');
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

describe('vendored js-synthesizer', () => {
  it('matches the installed npm js-synthesizer version', () => {
    const installed = JSON.parse(read('node_modules/js-synthesizer/package.json')).version;
    for (const file of ['js-synthesizer.js', 'js-synthesizer.worklet.js']) {
      const header = read(`public/js-synthesizer/${file}`).slice(0, 200);
      expect(header, `${file} header`).toContain(`js-synthesizer version ${installed}`);
    }
  });

  it('ships every libfluidsynth script the app loads', () => {
    const sources = [
      'index.html',
      'src/studio/core/audio/audioContextManager.ts',
      'src/studio/core/audio-engine/renderers/MidiTrackRenderer.ts',
    ];
    const referenced = new Set(sources.flatMap((source) => read(source).match(/libfluidsynth-[\d.]+\.js/g) ?? []));
    expect(referenced.size).toBeGreaterThan(0);
    for (const file of referenced) {
      expect(existsSync(path.join(root, 'public/js-synthesizer', file)), file).toBe(true);
    }
  });
});
