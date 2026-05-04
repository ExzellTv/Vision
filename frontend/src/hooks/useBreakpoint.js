import { useState, useEffect } from "react";

export default function useBreakpoint(maxWidth) {
  const [below, setBelow] = useState(() => window.innerWidth < maxWidth);

  useEffect(() => {
    const handler = () => setBelow(window.innerWidth < maxWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [maxWidth]);

  return below;
}
