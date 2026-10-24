export function ConfettiBurst({ className }) {
  return (
    <span className={className} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} style={{ '--confetti-angle': `${index * 45}deg` }} />
      ))}
    </span>
  );
}
