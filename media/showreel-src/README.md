# Showreel source

The 15-second animation at the top of the main README is built entirely from code:

- `lib.js`: a small, deterministic Canvas 2D motion toolkit (easing curves, springs, masked type, icons, particles).
- `scenes.js`: the storyboard, cut to a 120 BPM grid. Every frame is a pure function of time, so frames can be rendered in any order, and motion blur is real (24 sub-frames blended per frame).
- `render.mjs`: captures the frames with headless Chromium (Playwright).
- `audio.py`: synthesises the soundtrack with NumPy/SciPy, with every hit placed on the same timestamps as the animation.
- `encode.sh`: encodes the frames and soundtrack with ffmpeg into `../showreel.mp4` (1080p60, with sound), `../showreel.avif` (the looping version in the README: an animated AVIF autoplays like a GIF at a fraction of the size) and `../showreel.png` (a still for readers who prefer reduced motion).

The [Pages workflow](../../.github/workflows/pages.yml) publishes the MP4 on GitHub Pages, which is where the README's showreel and its "Watch in HD" link point: GitHub's own file view only offers an MP4 as a download.

## Preview in a browser

```sh
npm install
python3 -m http.server 8000   # then open http://localhost:8000/index.html?play
```

## Re-render

```sh
npm install && npx playwright install chromium
node render.mjs --out=frames      # 900 PNG frames, 1920×1080 @ 60 fps
pip install numpy scipy
bash encode.sh                    # needs ffmpeg with libx264 and an AV1 encoder
```

To check a single moment, render stills with a timestamp overlay: `node render.mjs --times=5.0,10.8 --out=stills --debug`.
