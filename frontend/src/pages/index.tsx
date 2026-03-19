import { useRouter } from "next/router";
import type React from "react";
import { useEffect } from "react";
import { getToken } from "@/utils/auth";

const HomePage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      router.replace("/sessions");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
};

export default HomePage;
