import React, { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

type Direction = "TOP" | "LEFT" | "BOTTOM" | "RIGHT";

type HoverBorderGradientProps<C extends React.ElementType = "button"> = {
  as?: C;
  containerClassName?: string;
  className?: string;
  duration?: number;
  clockwise?: boolean;
} & React.ComponentPropsWithoutRef<C>;

export function HoverBorderGradient<C extends React.ElementType = "button">({
  children,
  containerClassName,
  className,
  as,
  duration = 1,
  clockwise = true,
  ...props
}: HoverBorderGradientProps<C>) {
  const Tag = as || "button";
  const [hovered, setHovered] = useState<boolean>(false);
  const [direction, setDirection] = useState<Direction>("TOP");

  const rotateDirection = useCallback(
    (currentDirection: Direction): Direction => {
      const directions: Direction[] = ["TOP", "LEFT", "BOTTOM", "RIGHT"];
      const currentIndex = directions.indexOf(currentDirection);
      const nextIndex = clockwise
        ? (currentIndex - 1 + directions.length) % directions.length
        : (currentIndex + 1) % directions.length;
      return directions[nextIndex];
    },
    [clockwise]
  );

  const movingMap: Record<Direction, string> = {
    TOP: "radial-gradient(20.7% 50% at 50% 0%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
    LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
    BOTTOM:
      "radial-gradient(20.7% 50% at 50% 100%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
    RIGHT:
      "radial-gradient(16.2% 41.199999999999996% at 100% 50%, hsl(0, 0%, 100%) 0%, rgba(255, 255, 255, 0) 100%)",
  };

  const highlight =
    "radial-gradient(75% 181.15942028985506% at 50% 50%, #3275F8 0%, rgba(255, 255, 255, 0) 100%)";

  useEffect(() => {
    const activeDuration = hovered ? duration : duration * 15;
    const interval = setInterval(() => {
      setDirection((prevState) => rotateDirection(prevState));
    }, activeDuration * 1000);
    return () => clearInterval(interval);
  }, [hovered, duration, rotateDirection]);
  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-min w-fit flex-col flex-nowrap content-center items-center justify-center gap-10 overflow-visible rounded-full bg-transparent decoration-clone p-px transition duration-500 hover:bg-transparent",
        containerClassName
      )}
      {...props}
    >
      <motion.div
        className={cn(
          "pointer-events-none absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
        )}
        style={{
          filter: "blur(2px)",
          position: "absolute",
          width: "100%",
          height: "100%",
        }}
        initial={{ background: movingMap[direction] }}
        animate={{
          background: hovered
            ? [movingMap[direction], highlight]
            : movingMap[direction],
        }}
        transition={{
          ease: "linear",
          duration: hovered ? duration : duration * 15,
        }}
      />
      <div className="pointer-events-none absolute inset-[2px] z-[1] flex-none rounded-[inherit] bg-black" />
      <div
        className={cn(
          "relative z-[2] w-auto rounded-[inherit] bg-black text-white",
          className
        )}
      >
        {children}
      </div>
    </Tag>
  );
}
