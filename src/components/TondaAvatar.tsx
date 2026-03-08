import tondaImg from "@/assets/tonda-avatar.png";

interface TondaAvatarProps {
  size?: "sm" | "md" | "lg" | "nav";
  className?: string;
}

const sizes = {
  nav: "w-5 h-5",
  sm: "w-6 h-6",
  md: "w-10 h-10",
  lg: "w-14 h-14",
};

const TondaAvatar = ({ size = "md", className = "" }: TondaAvatarProps) => (
  <img
    src={tondaImg}
    alt="Tonda – AI Mechanik"
    className={`${sizes[size]} rounded-full object-cover ${className}`}
    loading="lazy"
  />
);

export default TondaAvatar;
