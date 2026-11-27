// The crisis card on screen while the divert call is open: STORM CLOSING over a draining
// timer, and the two choices side by side with what the fuel planner and the wind say about
// each. 1 DIVERT to the other strip, or 2 PUSH THROUGH to the planned one for the bonus.
import { crisisTimeLeft, DECISION_SECONDS } from './divert-decision.js';
import { AMBER, CREAM, CYAN, GREEN, RED, VIOLET, measure, text } from './hud-paint.js';

const STATUS = { ok: ['FUEL OK', GREEN], tight: ['FUEL TIGHT', AMBER], short: ['FUEL SHORT', RED] };

function keyBadge(g, x, y, key, colour) {
  g.fillStyle = colour;
  g.beginPath();
  g.roundRect(x, y, 46, 46, 9);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.stroke();
  text(g, key, x + 23, y + 25, 32, '#120e08', 'center', 900);
}

function optionCard(g, x, y, w, h, key, title, colour, lines) {
  g.fillStyle = 'rgba(10,12,20,0.9)';
  g.beginPath();
  g.roundRect(x, y, w, h, 12);
  g.fill();
  g.strokeStyle = colour;
  g.lineWidth = 3;
  g.stroke();
  keyBadge(g, x + 14, y + 14, key, colour);
  text(g, title, x + 72, y + 30, 28, colour, 'left', 900);
  lines.forEach(([value, tint], i) => text(g, value, x + 18, y + 84 + i * 28, 19, tint, 'left', 800));
}

/** Draw the open crisis call over the flying view. */
export function drawDivertPanel(g, W, H, session) {
  const crisis = session.crisis;
  if (!crisis || crisis.state !== 'open') return;
  const { divert, push } = crisis.options;
  // Between the checklist on the left and the altitude box on the right.
  const w = 716;
  const x = Math.max(342, (W - w) / 2);
  const y = 156;
  const head = 'STORM CLOSING · THE FRONT HAS CUT YOUR ROUTE';
  g.fillStyle = 'rgba(40,10,30,0.88)';
  g.beginPath();
  g.roundRect(x, y, w, 54, 10);
  g.fill();
  g.strokeStyle = VIOLET;
  g.lineWidth = 2.5;
  g.stroke();
  const size = Math.min(26, (26 * (w - 140)) / measure(g, head, 26, 900));
  text(g, head, x + 20, y + 22, size, '#ffffff', 'left', 900);
  const left = crisisTimeLeft(session);
  text(g, `${Math.ceil(left)} S`, x + w - 20, y + 23, 24, AMBER, 'right', 900);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x + 20, y + 42, w - 40, 6);
  g.fillStyle = left < 6 ? RED : AMBER;
  g.fillRect(x + 20, y + 42, (w - 40) * (left / DECISION_SECONDS), 6);

  const cw = (w - 16) / 2;
  const cy = y + 64;
  const ch = 186;
  const [divertFuel, divertTint] = STATUS[divert.plan.status];
  optionCard(g, x, cy, cw, ch, '1', 'DIVERT', CYAN, [
    [`${divert.strip.name.toUpperCase()} · ${divert.km} KM`, '#ffffff'],
    [`${divertFuel} · LAND WITH ${Math.max(0, Math.round(divert.plan.reserve))}%`, divertTint],
    ['STEADY AIR · SAFE CALL', CREAM],
  ]);
  const [pushFuel, pushTint] = STATUS[push.plan.status];
  optionCard(g, x + cw + 16, cy, cw, ch, '2', 'PUSH THROUGH', VIOLET, [
    [`${push.strip.name.toUpperCase()} · +${push.bonus}`, '#ffffff'],
    [`GUSTS ${push.gustKt} KT · LIGHTNING`, '#ffb0a0'],
    [`${pushFuel} · LAND WITH ${Math.max(0, Math.round(push.plan.reserve))}%`, pushTint],
  ]);
}
