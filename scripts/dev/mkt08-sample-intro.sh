#!/bin/bash
# MKT-08 Phase 1 gate, pass 2 — placeholder >100KB so the intro lane is ACTIVE
# through both reel:check AND the assemblers (pass 1's flat-colour plate encoded
# to 98KB and tripped the corrupt-file guard).
# Busy first segment (noise) inflates size; tail stays flat smoke for the dissolve.
set -u
cd /workspaces/HM26
A=assets/marketing
INTRO=$A/anchor_intro.mp4
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf

cleanup() {
  rm -f "$INTRO"
  echo "--- placeholder anchor_intro.mp4 removed (daily runs unaffected)"
}
trap cleanup EXIT

echo "=== placeholder intro v2 (4.5s, busy head + uniform smoke tail) ==="
ffmpeg -y -loglevel error \
  -f lavfi -i "nullsrc=s=1080x1920:r=60:d=3.7" \
  -f lavfi -i "color=c=0x2a1550:s=1080x1920:r=60:d=1.6" \
  -f lavfi -i "anoisesrc=amplitude=0.05:duration=4.5:sample_rate=48000" \
  -filter_complex "\
[0:v]geq=r='40+60*random(1)':g='20+30*random(1)':b='70+90*random(1)',\
drawbox=x=140:y=1120:w=800:h=320:color=0x241640@1:t=fill,\
drawtext=fontfile=$FONT:text='ANCHOR INTRO':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=760,\
drawtext=fontfile=$FONT:text='PLACEHOLDER':fontcolor=0x9b5bff:fontsize=56:x=(w-text_w)/2:y=870,\
setsar=1,format=yuv420p,settb=AVTB[a];\
[1:v]setsar=1,format=yuv420p,settb=AVTB[b];\
[a][b]xfade=transition=fade:duration=0.8:offset=2.9,format=yuv420p[v];\
[2:a]aresample=48000,afade=t=in:st=0:d=0.2,afade=t=out:st=4.2:d=0.3[aud]" \
  -map "[v]" -map "[aud]" -r 60 -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p \
  -c:a aac -ar 48000 -t 4.5 -movflags +faststart "$INTRO" || exit 1
echo "intro bytes: $(stat -c%s "$INTRO")"

echo "=== reel:check with intro ACTIVE ==="
npm run reel:check 2>&1 | grep -E "anchor_intro|carrier|NOT SAFE|safe to assemble"

echo "=== assembling samples WITH intro (stamp 19700101) ==="
npx tsx scripts/assemble-allday-reels.ts 19700101 || exit 1
npx tsx scripts/assemble-verification-reel.ts 19700101 || exit 1

echo "=== durations + integrated loudness ==="
for f in $A/allday_reels/allday_pro_19700101.mp4 $A/allday_reels/allday_free_19700101.mp4 $A/verify_reels/verify_reel_19700101.mp4; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  l=$(ffmpeg -i "$f" -af ebur128=framelog=quiet -f null - 2>&1 | grep "I:" | tail -1)
  echo "$(basename $f)  dur=$d  $l"
done
echo "SAMPLE RUN 2 COMPLETE"
