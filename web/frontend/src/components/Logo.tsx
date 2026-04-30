import logo from "../assets/logo.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Slyamova Zhanna · energy coach"
      width={193}
      height={97}
      className={className}
    />
  );
}
