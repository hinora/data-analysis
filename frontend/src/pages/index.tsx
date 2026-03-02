import { useRouter } from "next/router";
import type React from "react";
import { useEffect } from "react";

const HomePage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sessions");
  }, [router]);

  return null;
};

export default HomePage;
