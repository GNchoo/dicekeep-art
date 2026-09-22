#!/usr/bin/env node
// Dicekeep 캐주얼 아트 골든 슬라이스 잡 생성기.
//
//   node tools/golden-slice-jobs.mjs
//   node tools/golden-slice-jobs.mjs --candidates=2 --quality=high
//   node tools/golden-slice-jobs.mjs --out=tools/jobs/golden-slice.json
//
// 생성 결과는 검수 전용 gen/golden-slice/ 아래에만 둔다. runtimeTarget은 승인 후
// 사람이 승격할 위치를 기록하는 메타데이터이며 이 도구나 img-gen이 쓰지 않는다.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const arg = args.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
};

const candidates = Number(option('candidates', '1'));
const quality = option('quality');
if (!Number.isInteger(candidates) || candidates < 1 || candidates > 2) {
  console.error('--candidates는 1 또는 2여야 합니다.');
  process.exit(2);
}
if (quality != null && !['low', 'medium', 'high'].includes(quality)) {
  console.error('--quality는 low, medium, high 중 하나여야 합니다.');
  process.exit(2);
}

const jobs = [];
const fixed = (width, height, alpha = 'preserve') => ({ mode: 'fixed', width, height, alpha, anchor: 'center' });
const cover = (width, height) => ({ mode: 'cover', width, height, alpha: 'opaque', anchor: 'center' });
const trimContain = (maxWidth, maxHeight, anchor = 'center') => ({ mode: 'trim-contain', maxWidth, maxHeight, alpha: 'preserve', anchor, trimAlphaThreshold: 8 });
function runtimeSpecFor(id) {
  if (id === 'arena-floor') return cover(1280, 720);
  if (id === 'arena-board' || id === 'arena-road') return fixed(1024, 1024, 'opaque');
  if (id.startsWith('arena-')) return fixed(1024, 1024);
  if (/^tower-(?:die-[1-6]|premium-)/.test(id)) return trimContain(384, 384, 'bottom-center');
  if (id.startsWith('tower-star-')) return fixed(384, 384);
  if (id.startsWith('enemy-')) return trimContain(280, 280, 'bottom-center');
  if (id.startsWith('boss-')) return fixed(512, 512);
  if (id === 'ui-home-stage' || id === 'ui-deck') return fixed(64, 64);
  if (id.startsWith('ui-')) return fixed(512, 512);
  if (id === 'vfx-laser-trail') return trimContain(320, 64);
  if (id === 'vfx-muzzle-flash' || id === 'vfx-projectile-bolt') return trimContain(320, 320);
  if (id === 'vfx-impact-sheet') return fixed(512, 512);
  throw new Error(`runtimeSpec이 없는 골든 슬라이스 잡입니다: ${id}`);
}

const add = ({ id, category, profile = 'environment', runtimeTarget, prompt, refs = [], ...options }) => {
  const job = {
    id: `golden-${id}`,
    category,
    styleProfile: profile,
    runtimeTarget,
    runtimeSpec: runtimeSpecFor(id),
    n: candidates,
    outputFormat: 'png',
    out: `gen/golden-slice/${category}/${id}`,
    prompt,
    ...(quality ? { quality } : {}),
    ...options,
  };
  if (refs.length) {
    job.refs = refs;
    job.inputFidelity = 'high';
  }
  jobs.push(job);
};

const TILE_COMMON = 'Create one production-ready asset for the Dicekeep infinity arena. It must remain readable behind towers, enemies, projectiles and HTML interface elements at phone size. No characters, towers, interface, lettering, numbers, logo or watermark.';
const transparentTile = { size: '1024x1024', background: 'transparent' };

add({
  id: 'arena-floor', category: 'environment', runtimeTarget: 'casual/tiles/arena/floor.jpg',
  size: '1536x1024', background: 'opaque', outputFormat: 'jpeg',
  prompt: `${TILE_COMMON} A wide 3/4 top-down empty arena floor of broad violet-gray flagstones, subtle warm-gold seams and a restrained central dice-rune motif. Full-bleed landscape composition with calm low-contrast detail and an unobstructed center. Design the important floor area to survive a centered 16:9 crop; no wall, road, pad, portal or prop.`,
});
add({
  id: 'arena-board', category: 'environment', runtimeTarget: 'casual/tiles/arena/board.png',
  size: '1024x1024', background: 'opaque', refs: ['casual/tiles/arena/board.png'],
  prompt: `${TILE_COMMON} Redraw the referenced square arena board texture as broad violet-gray stone slabs with simplified joints and sparse warm highlights. This is a repeating surface pattern rendered at 256 pixels, so all four edges must join seamlessly. Perfectly square, full-bleed, quiet center, even lighting, no perspective-distorted outer scene. No inset border, frame, corner ornaments, sockets or runes; the game draws those separately.`,
});
add({
  id: 'arena-road', category: 'environment', runtimeTarget: 'casual/tiles/arena/road.png',
  size: '1024x1024', background: 'opaque', refs: ['casual/tiles/arena/road.png'],
  prompt: `${TILE_COMMON} Redraw the referenced seamless road texture as broad rounded violet stone pavers with sparse warm-gold joint accents. It must tile seamlessly on all four edges and work when code bends, rotates and masks it into paths. Uniform scale, no painted turn, border, arrow or endpoint.`,
});
add({
  id: 'arena-pad', category: 'environment', runtimeTarget: 'casual/tiles/arena/pad.png',
  ...transparentTile, refs: ['casual/tiles/arena/pad.png'],
  prompt: `${TILE_COMMON} Redraw the referenced tower placement pad: one low circular violet-stone socket seen from 3/4 top-down, thin ivory-and-gold rim, six small pip-like studs and a calm empty center for a tower. Centered with generous transparent margin, grounded and symmetrical, no glow column or tower.`,
});
add({
  id: 'arena-start', category: 'environment', runtimeTarget: 'casual/tiles/arena/start.png',
  ...transparentTile, refs: ['casual/tiles/arena/start.png'],
  prompt: `${TILE_COMMON} Redraw the referenced enemy entrance as one compact round violet-stone portal seen from 3/4 top-down. A dark blue-violet opening, ivory dice-stone arch and a restrained cyan-violet inner glow clearly mark START without any symbol or text. Centered, grounded, transparent surroundings.`,
});
add({
  id: 'arena-end', category: 'environment', runtimeTarget: 'casual/tiles/arena/end.png',
  ...transparentTile, refs: ['casual/tiles/arena/end.png'],
  prompt: `${TILE_COMMON} Redraw the referenced destination as one small friendly ivory die keep seen from 3/4 top-down, red pips, gold trim, blue-violet crystal beacon and a sturdy violet-stone base. Clear end-of-path silhouette at 64 pixels, centered, grounded, transparent surroundings.`,
});
add({
  id: 'arena-prop-1', category: 'environment', runtimeTarget: 'casual/tiles/arena/prop-1.png',
  ...transparentTile, refs: ['casual/tiles/arena/prop-1.png'],
  prompt: `${TILE_COMMON} Redraw the referenced arena decoration as one short violet-stone brazier with a compact warm-gold flame and one small ivory die ornament. Low silhouette, centered, grounded, transparent surroundings; it must never resemble a tower pad or enemy.`,
});
add({
  id: 'arena-prop-2', category: 'environment', runtimeTarget: 'casual/tiles/arena/prop-2.png',
  ...transparentTile, refs: ['casual/tiles/arena/prop-2.png'],
  prompt: `${TILE_COMMON} Redraw the referenced arena decoration as a compact cluster of two rounded violet crystals and a small ivory die-stone shard on a low rubble base. Quiet blue-violet glow, low silhouette, centered, grounded, transparent surroundings.`,
});
add({
  id: 'arena-prop-3', category: 'environment', runtimeTarget: 'casual/tiles/arena/prop-3.png',
  ...transparentTile, refs: ['casual/tiles/arena/prop-3.png'],
  prompt: `${TILE_COMMON} Redraw the referenced arena decoration as one squat violet-stone pillar capped by a small gold dice-rune ring. Broad simple forms, low contrast, centered, grounded, transparent surroundings; no flame, tower weapon or interface symbol.`,
});

const TOWER_COMMON = 'Redraw the referenced Dicekeep tower as one stable freestanding defense building in 3/4 top-down view, facing slightly right, with the same flat integrated foundation. Preserve its role, footprint, ground pivot and tall readable silhouette. The body is completely still and rigid; no squash, stretch, firing pose, projectile, motion trail, baked glow aura, separate pedestal, text, number, star, logo or watermark. Centered with generous transparent margin.';
const towerRoles = [
  ['tower-die-1', 'towers/die-1.png', 'A slim ivory watchtower with one large crimson eye-lens in a brass iris, designed for a precise thin laser.'],
  ['tower-die-2', 'towers/die-2.png', 'A compact ivory artillery fort with two black iron cannon ports, bronze rims and small powder-keg shapes at its base.'],
  ['tower-die-3', 'towers/die-3.png', 'A tall ivory arcane obelisk with three amethyst rune-gems and a restrained violet crystal crown.'],
  ['tower-die-4', 'towers/die-4.png', 'A tapered ivory frost spire with four blue ice-crystal corner devices and a compact frozen crown.'],
  ['tower-die-5', 'towers/die-5.png', 'An ivory lightning tower with four copper rods around one central blue-white coil, cables contained inside its silhouette.'],
  ['tower-die-6', 'towers/die-6.png', 'A broad ivory fortress with six dark mortar ports, restrained gold crown trim and a short crimson banner.'],
];
for (const [id, target, role] of towerRoles) {
  add({
    id, category: 'tower', profile: 'tower', runtimeTarget: target, size: '1024x1024', background: 'transparent', refs: [target],
    prompt: `${TOWER_COMMON} ${role} Ivory die-stone, red pip accents, warm gold hardware and one blue-violet magic accent bind it to the Dicekeep set.`,
  });
}
add({
  id: 'tower-star-07', category: 'tower', profile: 'tower', runtimeTarget: 'casual/towers/star-07.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/towers/star-07.png'],
  prompt: `${TOWER_COMMON} An early evolved ivory die keep: confident but compact, one small gold battlement tier, red pip windows and a restrained blue-violet focus crystal. It must look clearly stronger than the six-pip base tower while leaving room for many later upgrades.`,
});
add({
  id: 'tower-star-20', category: 'tower', profile: 'tower', runtimeTarget: 'casual/towers/star-20.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/towers/star-20.png'],
  prompt: `${TOWER_COMMON} The final evolved ivory die citadel: broad gold-trimmed battlements, six red pip ports, one large blue-violet crown crystal and a controlled royal silhouette. Powerful and premium in construction detail, yet clean at 96 pixels and never taller than the safe canvas margin.`,
});
add({
  id: 'tower-premium-arcane', category: 'tower', profile: 'tower', runtimeTarget: 'casual/towers/t3-d.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/towers/t3-a.png', 'casual/towers/t3-d.png'],
  prompt: `${TOWER_COMMON} Premium cosmetic version of the three-pip arcane obelisk. Keep the first reference's exact gameplay silhouette and pedestal; use polished ivory, restrained gold filigree, three ruby-amethyst rune gems and a short red velvet accent inspired by the second reference. Cosmetic richness only: no larger weapon, brighter attack cue or expanded footprint.`,
});

const CHARACTER_COMMON = 'One complete Dicekeep character, full body, 3/4 side view facing right, centered with at least 12% transparent margin. One consistent ground pivot, no floor, shadow, pedestal, scenery, motion sheet, text, logo or watermark. Preserve the referenced identity while simplifying noisy detail. Anatomically coherent limbs and joints; no body warp.';
add({
  id: 'enemy-ground-biped', category: 'character', profile: 'character', runtimeTarget: 'casual/enemies/pig.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/enemies/pig.png'],
  prompt: `${CHARACTER_COMMON} A friendly but determined upright pig bandit in a brown leather vest, red scarf and small wooden buckler. True plantigrade two-legged stance: hips, forward-facing knees, shins and feet form a natural humanlike chain; both feet rest on the same baseline and the knees must never bend backward.`,
});
add({
  id: 'enemy-ground-quadruped', category: 'character', profile: 'character', runtimeTarget: 'casual/enemies/rhino.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/enemies/rhino.png'],
  prompt: `${CHARACTER_COMMON} A sturdy baby gray rhinoceros scout wearing simple brown harness armor and one blue-violet dice charm. Clearly quadrupedal: four distinct weight-bearing legs under the body, natural knees and hocks, all hooves visible, horn and face unobstructed.`,
});
add({
  id: 'enemy-air', category: 'character', profile: 'character', runtimeTarget: 'casual/enemies/martin.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/enemies/martin.png'],
  prompt: `${CHARACTER_COMMON} A small swift house-martin aerial scout with navy-and-cream feathers, a tiny red courier scarf and one gold dice clasp. Wings fully open and clearly support flight; feet tucked naturally, body visibly airborne and level, with no walking pose or invisible ground contact.`,
});
add({
  id: 'enemy-burrow', category: 'character', profile: 'character', runtimeTarget: 'casual/enemies/fennel.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/enemies/fennel.png'],
  prompt: `${CHARACTER_COMMON} A compact fennel-root miner with a leafy helmet, round goggles, small brass hand drill and sturdy boots. A corkscrew root-tail and earth-colored tool shapes make the burrowing role clear, while the intact complete body and both correctly jointed legs remain visible and grounded.`,
});

add({
  id: 'boss-w010-rat-king', category: 'character', profile: 'character', runtimeTarget: 'casual/bosses/inf/b010.png',
  size: '1024x1024', background: 'transparent', refs: ['casual/bosses/inf/b010.png'],
  prompt: `${CHARACTER_COMMON} Boss: the Plague Rat King, a large upright rat monarch with intact charcoal fur, rounded expressive face, simple gold crown, broad bracers and a wine-red cape. Exactly one curved tail and two sturdy plantigrade feet. Proud, imposing and approachable; forward-facing knees bend naturally and never backward.`,
});
add({
  id: 'boss-w100-doom-lord', category: 'character', profile: 'character', runtimeTarget: 'casual/bosses/inf/b100.png',
  size: '1024x1024', background: 'transparent',
  prompt: `${CHARACTER_COMMON} Boss: the Doom Lord, an intact masked fantasy ruler in a closed deep-navy robe and broad black-violet plate armor, a crown of three floating violet crystal shards and two small star-like eye lights on a smooth hood mask. Holds one compact crescent scythe with restrained violet energy. Grounded biped stance with two solid armored boots and natural forward knees; powerful readable silhouette, no skull anatomy, torn flesh, void hole, rift or surrounding debris.`,
});

const UI_COMMON = 'One isolated Dicekeep mobile-game interface icon, bold simple silhouette readable at 36 pixels, centered on a transparent square with generous safe margin. Use ivory, warm gold, red pip and controlled blue-violet accents. Front or shallow 3/4 view, no panel, scenery, character, text, letter, number, notification dot, logo or watermark.';
add({
  id: 'ui-home-stage', category: 'ui', profile: 'icon', runtimeTarget: 'ui/icon-stage.png',
  size: '1024x1024', background: 'transparent', refs: ['ui/icon-stage.png'],
  prompt: `${UI_COMMON} Home stage-selection icon: a compact gold-edged violet route tile leading to a tiny ivory die keep and one simple red checkpoint pennant. One connected silhouette, no map labels or loose particles.`,
});
add({
  id: 'ui-deck', category: 'ui', profile: 'icon', runtimeTarget: 'ui/icon-dice.png',
  size: '1024x1024', background: 'transparent', refs: ['ui/icon-dice.png'],
  prompt: `${UI_COMMON} Deck-building icon: three compact ivory dice cards fanned slightly, each with one to three red pips and one thin gold border. Exactly one connected icon silhouette, no loose particles.`,
});
add({
  id: 'ui-attendance', category: 'ui', profile: 'icon', runtimeTarget: 'ui/rewards/attendance-bag.webp',
  size: '1024x1024', background: 'transparent', outputFormat: 'webp', refs: ['ui/rewards/attendance-bag.webp'],
  prompt: `${UI_COMMON} Attendance reward icon: a plump red drawstring gift pouch with gold cord, an ivory die seal with red pips and one small blue-violet ticket tucked behind it. Warm, generous and immediately recognizable as a daily reward.`,
});
add({
  id: 'ui-mail', category: 'ui', profile: 'icon', runtimeTarget: 'ui/rewards/mail.webp',
  size: '1024x1024', background: 'transparent', outputFormat: 'webp', refs: ['ui/rewards/mail.webp'],
  prompt: `${UI_COMMON} Mailbox reward icon: one cream envelope with a thick warm-gold rim and red wax die seal, resting in a compact violet stone mailbox slot. Clear envelope silhouette and closed seal, no written marks.`,
});
add({
  id: 'ui-growth-pass', category: 'ui', profile: 'icon', runtimeTarget: 'ui/rewards/growth-pass.webp',
  size: '1024x1024', background: 'transparent', outputFormat: 'webp', refs: ['ui/rewards/growth-pass.webp'],
  prompt: `${UI_COMMON} Growth pass icon: one premium navy-violet ticket with rounded corners, gold trim, a central ivory die crest with red pips and a short red ribbon tab. Rich but compact, no crown, price mark or written label.`,
});

const VFX_COMMON = 'One Dicekeep combat-effect asset on a transparent canvas. Bold compact shapes, clean warm-charcoal edge where needed, bright core with controlled bloom, readable at 24 to 64 pixels. Centered with generous empty margin; no tower, enemy, floor, scenery, text, logo or watermark.';
add({
  id: 'vfx-muzzle-flash', category: 'vfx', profile: 'vfx', runtimeTarget: 'vfx/muzzle-flash.png',
  size: '1024x1024', background: 'transparent', refs: ['vfx/muzzle-flash.png'],
  prompt: `${VFX_COMMON} A single directional cannon muzzle flash pointing right: compact white-yellow diamond core, three warm-gold triangular flame petals and two tiny orange sparks. The origin point is exactly at canvas center and the effect extends mostly to the right.`,
});
add({
  id: 'vfx-projectile-bolt', category: 'vfx', profile: 'vfx', runtimeTarget: 'vfx/bolt.png',
  size: '1024x1024', background: 'transparent', refs: ['vfx/bolt.png'],
  prompt: `${VFX_COMMON} A single blue-violet arcane bolt traveling right: short ivory-white core, rounded violet head, tapered cyan tail and one thin warm-gold rim accent. Horizontal axis, compact length, no detached fragments.`,
});
add({
  id: 'vfx-laser-trail', category: 'vfx', profile: 'vfx', runtimeTarget: 'vfx/laser-beam.png',
  size: '1536x1024', background: 'transparent', refs: ['vfx/laser-beam.png'],
  prompt: `${VFX_COMMON} One perfectly straight horizontal laser trail from left to right across the center: narrow white core, crimson inner band and soft red outer glow. Uniform thickness through the middle 80%, cleanly tapered ends, large transparent space above and below.`,
});
add({
  id: 'vfx-impact-sheet', category: 'vfx', profile: 'vfx', runtimeTarget: 'vfx/impact-2x2.png',
  size: '1024x1024', background: 'transparent', refs: ['vfx/impact-2x2.png'],
  prompt: `${VFX_COMMON} A precise 2x2 sprite sheet of one golden-violet hit burst, four equal cells read left-to-right then top-to-bottom: 1 compact contact spark, 2 full six-ray burst, 3 expanding broken ring and dice-pip sparks, 4 three fading sparks. Same center and scale envelope in every cell, no grid lines, nothing crosses a cell boundary.`,
});

const spec = {
  schemaVersion: 1,
  purpose: 'Dicekeep casual-art golden slice. Candidates only; runtime promotion is manual after visual approval.',
  styleProfile: 'environment',
  candidatePolicy: { default: 1, maximum: 2, promotion: 'manual-only' },
  jobs,
};

const json = `${JSON.stringify(spec, null, 2)}\n`;
const out = option('out');
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, json, 'utf8');
  console.log(`→ ${out} (${jobs.length} jobs, ${candidates} candidate${candidates === 1 ? '' : 's'} each, ${quality || 'profile quality'})`);
} else {
  process.stdout.write(json);
}
