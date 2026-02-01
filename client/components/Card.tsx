interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`
        backdrop-blur-md
        bg-white/5
        border border-white/10
        rounded-2xl
        shadow-lg
        shadow-black/20
        ${className}
      `}
    >
      {children}
    </div>
  );
}
