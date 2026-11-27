// Keyboard and mouse: held keys ramp the stick smoothly (no on/off jerks), Shift/Ctrl (or +/-)
// walk the throttle, one-shot keys queue actions (flaps, gear, camera, map, pause, drop, mission
// picks), and holding the left mouse button steers by the pointer's offset from centre.

export const ACTIONS = ['flaps', 'gear', 'camera', 'map', 'pause', 'drop', 'confirm', 'back', 'retry', 'pick1', 'pick2', 'pick3', 'pick4', 'invert', 'audio'];

const KEY_ACTIONS = {
  KeyF: 'flaps', KeyG: 'gear', KeyC: 'camera', KeyM: 'map', KeyP: 'pause', Escape: 'back', KeyX: 'drop',
  Enter: 'confirm', Space: 'confirm', KeyT: 'retry', Digit1: 'pick1', Digit2: 'pick2', Digit3: 'pick3', Digit4: 'pick4', KeyI: 'invert', KeyN: 'audio',
  ArrowLeft: 'left', ArrowRight: 'right',
};

export function createInput(target = window) {
  const held = new Set();
  const queue = [];
  const stick = { pitch: 0, roll: 0, yaw: 0 };
  const mouse = { down: false, x: 0, y: 0 };
  let throttle = 0;
  let invert = false;

  target.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code) || event.ctrlKey) event.preventDefault();
    if (!event.repeat && KEY_ACTIONS[event.code]) queue.push(KEY_ACTIONS[event.code]);
    held.add(event.code);
  });
  target.addEventListener('keyup', (event) => held.delete(event.code));
  target.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', (event) => {
    if (event.button === 0) mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('pointerup', () => { mouse.down = false; });
  target.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  const axis = (neg, pos) => (held.has(pos[0]) || held.has(pos[1]) ? 1 : 0) - (held.has(neg[0]) || held.has(neg[1]) ? 1 : 0);
  const ramp = (value, goal, dt) => {
    const rate = goal === 0 ? 6 : Math.sign(goal) !== Math.sign(value) ? 7 : 3.2;
    const step = rate * dt;
    return Math.abs(goal - value) <= step ? goal : value + Math.sign(goal - value) * step;
  };

  return {
    /** The stick, rudder, throttle and brakes for this frame. */
    read(dt, aircraftThrottle) {
      if (aircraftThrottle !== undefined && Math.abs(aircraftThrottle - throttle) > 0.001 && !held.has('ShiftLeft') && !held.has('ShiftRight') && !held.has('ControlLeft') && !held.has('ControlRight')) throttle = aircraftThrottle;
      let pitchGoal = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
      if (invert) pitchGoal = -pitchGoal;
      let rollGoal = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
      const yawGoal = axis(['KeyQ', 'KeyZ'], ['KeyE', 'KeyV']);
      if (mouse.down) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        rollGoal = Math.max(-1, Math.min(1, ((mouse.x - w / 2) / (w * 0.3))));
        pitchGoal = Math.max(-1, Math.min(1, ((mouse.y - h / 2) / (h * 0.3))));
      }
      stick.pitch = mouse.down ? pitchGoal : ramp(stick.pitch, pitchGoal, dt);
      stick.roll = mouse.down ? rollGoal : ramp(stick.roll, rollGoal, dt);
      stick.yaw = ramp(stick.yaw, yawGoal, dt);
      const up = held.has('ShiftLeft') || held.has('ShiftRight') || held.has('Equal') || held.has('PageUp') || held.has('NumpadAdd');
      const down = held.has('ControlLeft') || held.has('ControlRight') || held.has('Minus') || held.has('PageDown') || held.has('NumpadSubtract');
      throttle = Math.max(0, Math.min(1, throttle + ((up ? 1 : 0) - (down ? 1 : 0)) * dt * 0.55));
      return { pitch: stick.pitch, roll: stick.roll, yaw: stick.yaw, throttle, brakes: held.has('KeyB'), refuel: held.has('KeyR') };
    },
    /** One-shot actions since the last call. */
    takeActions() {
      const list = queue.splice(0, queue.length);
      if (list.includes('invert')) invert = !invert;
      return list;
    },
    setThrottle(value) {
      throttle = value;
    },
    isInverted: () => invert,
  };
}
