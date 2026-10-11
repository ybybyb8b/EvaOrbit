// Critically damped repositioning spring: damping 1, response .4s.
const frequency = 2 * Math.PI / .4;
export function subscriptionSettle(from: number, to: number, velocity: number, seconds: number) {
  const offset = from - to;
  const speed = Math.max(-frequency * Math.abs(offset), Math.min(velocity, frequency * Math.abs(offset)));
  const coefficient = speed + frequency * offset;
  const decay = Math.exp(-frequency * seconds);
  return { left: to + (offset + coefficient * seconds) * decay,
    velocity: (speed - frequency * coefficient * seconds) * decay };
}
export function subscriptionSnapTarget(positions: number[], left: number, velocity: number) {
  if (!positions.length) return left;
  const nearest = (value: number) => positions.reduce((best, position, index) => Math.abs(position - value) < Math.abs(positions[best] - value) ? index : best, 0);
  const current = nearest(left), projected = nearest(left + velocity * 180);
  return positions[Math.max(current - 1, Math.min(current + 1, projected))];
}
