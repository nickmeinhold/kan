import Image from "next/image";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import { getInitialsFromName, inferInitialsFromEmail } from "~/utils/helpers";

const sizeMap = {
  xs: 20,
  sm: 24,
  md: 36,
  lg: 48,
} as const;

const InitialsFallback = ({
  size,
  icon,
  initials,
  isLoading,
}: {
  size: "xs" | "sm" | "md" | "lg";
  icon?: React.ReactNode;
  initials: string;
  isLoading?: boolean;
}) => (
  <span
    className={twMerge(
      "inline-flex h-9 w-9 items-center justify-center rounded-full bg-light-1000 dark:bg-dark-400",
      isLoading && "animate-pulse bg-light-200 dark:bg-dark-200",
      size === "xs" && "h-5 w-5",
      size === "sm" && "h-6 w-6",
      size === "lg" && "h-12 w-12",
    )}
  >
    {icon ? (
      <span className="text-[12px] text-white">{icon}</span>
    ) : (
      <span
        className={twMerge(
          "text-sm font-medium leading-none text-white",
          size === "xs" && "text-[8px]",
          size === "sm" && "text-[10px]",
          size === "lg" && "text-md",
        )}
      >
        {initials}
      </span>
    )}
  </span>
);

const Avatar = ({
  size = "md",
  name,
  email,
  icon,
  imageUrl,
  isLoading,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  name: string;
  email: string;
  imageUrl?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
}) => {
  const [imgError, setImgError] = useState(false);
  const initials = name?.trim()
    ? getInitialsFromName(name)
    : inferInitialsFromEmail(email);

  if (!imageUrl || imgError) {
    return (
      <InitialsFallback
        size={size}
        icon={icon}
        initials={initials}
        isLoading={isLoading}
      />
    );
  }

  return (
    <Image
      src={imageUrl}
      className="rounded-full bg-gray-50"
      width={sizeMap[size]}
      height={sizeMap[size]}
      alt=""
      onError={() => setImgError(true)}
    />
  );
};

export default Avatar;
