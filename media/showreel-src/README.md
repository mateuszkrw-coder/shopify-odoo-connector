# Showreel source

The 15-second animation at the top of the main README (`../showreel.gif`, `../showreel.mp4`) is built entirely from code:

- `lib.js`: a small, deterministic Canvas 2D motion toolkit (easing curves, springs, masked type, icons, particles).
- `scenes.js`: the storyboard, cut to a 120 BPM grid. Every frame is a pure function of time, so frames can be rendered in any order, and motion blur is real (24 sub-frames blended per frame).
- `render.mjs`: captures the frames with headless Chromium (Playwright).
- `audio.py`: synthesises the soundtrack with NumPy/SciPy, with every hit placed on the same timestamps as the animation.
- `encode.sh`: encodes the frames and soundtrack into the MP4 and GIF with ffmpeg.

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
bash encode.sh                    # writes ../showreel.mp4 and ../showreel.gif (needs ffmpeg)
```

To check a single moment, render stills with a timestamp overlay: `node render.mjs --times=5.0,10.8 --out=stills --debug`.
