#!/usr/bin/env bash
# Turns the rendered frames (node render.mjs --out=frames) into the README GIF
# and the HD MP4 with its soundtrack. Needs ffmpeg (or FFMPEG=/path/to/ffmpeg),
# plus numpy and scipy for the soundtrack.
set -euo pipefail
cd "$(dirname "$0")"
FFMPEG=${FFMPEG:-ffmpeg}
OUT=${OUT:-..}

# soundtrack, loudness-normalised to -16 LUFS / -1.5 dBTP (two-pass, linear)
python3 audio.py soundtrack.wav
stats=$("$FFMPEG" -hide_banner -nostats -i soundtrack.wav \
  -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
val() { printf '%s' "$stats" | python3 -c "import json, sys; print(json.load(sys.stdin)['$1'])"; }
"$FFMPEG" -hide_banner -loglevel error -y -i soundtrack.wav \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset):linear=true,aresample=48000" \
  soundtrack_norm.wav

# MP4: 1080p60 H.264 with an explicit BT.709 conversion (the default BT.601
# matrix would shift the brand greens and purples)
"$FFMPEG" -hide_banner -loglevel error -y -framerate 60 -i frames/f_%04d.png -i soundtrack_norm.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -tune animation -g 120 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT/showreel.mp4"

# GIF: 960 px, 30 fps, one global palette + error-diffusion dither (keeps the
# motion blur smooth), loops forever
"$FFMPEG" -hide_banner -loglevel error -y -framerate 60 -i frames/f_%04d.png \
  -vf "fps=30,scale=960:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=full" palette.png
"$FFMPEG" -hide_banner -loglevel error -y -framerate 60 -i frames/f_%04d.png -i palette.png \
  -lavfi "fps=30,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 "$OUT/showreel.gif"

rm -f soundtrack.wav soundtrack_norm.wav palette.png
echo "wrote $OUT/showreel.mp4 and $OUT/showreel.gif"
