import logo from "../assets/logo.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src={logo}
      alt="Slyamova Zhanna"
      width={193}
      height={87}
      className={className}
    />
  );
}
