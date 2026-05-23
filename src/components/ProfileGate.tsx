import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

// Allowed paths even when profile incomplete
const ALLOWED = ["/complete-profile", "/auth", "/reset-password", "/terms"];

const ProfileGate = () => {
  const { user, profile, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !user || !profile) return;
    const incomplete = !profile.phone?.trim() || !profile.full_name?.trim();
    if (!incomplete) return;
    if (ALLOWED.includes(location.pathname)) return;
    navigate("/complete-profile", { replace: true });
  }, [user, profile, isLoading, location.pathname, navigate]);

  return null;
};

export default ProfileGate;
