// Small vector and quaternion helpers for the flight model, plain arrays and objects so the
// physics runs in Node as well as the browser. Axes: +X east, +Y up, -Z north. The aircraft's
// nose is its local -Z, its right wing local +X, its roof local +Y.

export function vec(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function scaled(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function normalized(a) {
  const l = length(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}

/** Quaternions as [x, y, z, w]. */
export function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatAxisAngle(ax, ay, az, angle) {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

export function quatNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate the vector (x, y, z) by quaternion q. */
export function quatRotate(q, x, y, z) {
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

/**
 * The orientation for a heading (radians clockwise from north), pitch (nose up positive) and
 * bank (right wing down positive).
 */
export function quatFromAttitude(heading, pitch, bank) {
  const yaw = quatAxisAngle(0, 1, 0, -heading);
  const nose = quatAxisAngle(1, 0, 0, pitch);
  const roll = quatAxisAngle(0, 0, 1, -bank);
  return quatNormalize(quatMultiply(quatMultiply(yaw, nose), roll));
}

/** Heading (0..2π clockwise from north), pitch and bank of an orientation. */
export function attitudeOf(q) {
  const f = quatRotate(q, 0, 0, -1);
  const u = quatRotate(q, 0, 1, 0);
  const r = quatRotate(q, 1, 0, 0);
  let heading = Math.atan2(f.x, -f.z);
  if (heading < 0) heading += Math.PI * 2;
  const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
  const bank = Math.atan2(-r.y, u.y);
  return { heading, pitch, bank, forward: f, up: u, right: r };
}

/** Wrap an angle in radians to (-π, π]. */
export function wrapAngle(a) {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v <= -Math.PI) v += Math.PI * 2;
  return v;
}

/** Degrees 0..359 for a heading in radians. */
export function headingDegrees(heading) {
  const d = Math.round((heading * 180) / Math.PI) % 360;
  return d < 0 ? d + 360 : d;
}
