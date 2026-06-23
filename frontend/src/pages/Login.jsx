import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignInPage } from '../components/ui/sign-in';
import axios from 'axios';

const sampleTestimonials = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/57.jpg",
    name: "Sarah Chen",
    handle: "@sarahdigital",
    text: "Amazing platform! The user experience is seamless and the features are exactly what I needed."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "David Martinez",
    handle: "@davidcreates",
    text: "I've tried many platforms, but this one stands out. Intuitive, reliable, and genuinely helpful for productivity."
  },
];

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const [isCreateMode, setIsCreateMode] = useState(false);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

  const handleSignIn = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");

    try {
      if (onLogin) {
        await onLogin({ email });
      }
      navigate('/');
    } catch {
      alert("Sign-in failed. Check backend availability and credentials.");
    }
  };

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    alert(`Account created successfully for ${name}! Please sign in.`);
    setIsCreateMode(false);
  };

  const handleGoogleSignIn = (googleProfile) => {
    if (!googleClientId) {
      alert("Google OAuth is not configured. Add VITE_GOOGLE_CLIENT_ID in frontend/.env and restart the dev server.");
      return;
    }

    const email = googleProfile?.email;
    if (!email) {
      alert("Google sign-in failed. No email was returned. Please check Google OAuth origin/redirect settings and try again.");
      return;
    }

    const completeLogin = async () => {
      if (apiBaseUrl && googleProfile?.credential) {
        const response = await axios.post(`${apiBaseUrl}/auth/google`, {
          credential: googleProfile.credential,
        });

        const payload = response?.data?.data;
        if (!payload?.user?.email || !payload?.accessToken) {
          throw new Error("Invalid backend auth response");
        }

        localStorage.setItem("accessToken", payload.accessToken);
        localStorage.setItem("refreshToken", payload.refreshToken || "");

        await onLogin?.({
          email: payload.user.email,
          name: payload.user.name || "",
          picture: payload.user.picture || "",
        });
      } else {
        await onLogin?.({
          email,
          name: googleProfile?.name || "",
          picture: googleProfile?.picture || "",
          credential: googleProfile?.credential || "",
        });
      }

      navigate('/');
    };

    completeLogin().catch((error) => {
      console.error("Google backend sign-in failed", {
        origin: window.location.origin,
        googleClientId,
        apiBaseUrl,
        response: error?.response?.data || null,
        message: error?.message,
      });
      alert("Google sign-in failed while contacting backend. Check VITE_API_BASE_URL and backend /api/auth/google.");
    });
  };

  const handleResetPassword = () => {
    alert("Password reset instructions sent to your email!");
  };

  const titleText = (
    <span className="flex flex-col gap-2">
      <span className="font-display font-extrabold text-primary tracking-tight">
        {isCreateMode ? "Create Account" : "AI Ready School"}
      </span>
      <span className="font-light text-on-surface-variant text-sm uppercase tracking-wider">
        {isCreateMode ? "Join the platform" : "AI Study Partner"}
      </span>
    </span>
  );

  const descriptionText = "";

  return (
    <div className="bg-surface-container-lowest min-h-screen text-on-surface select-none">
      <SignInPage
        title={titleText}
        description={descriptionText}
        heroImageSrc="https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80"
        testimonials={sampleTestimonials}
        onSignIn={handleSignIn}
        onCreateSubmit={handleCreateSubmit}
        onGoogleSignIn={handleGoogleSignIn}
        googleClientId={googleClientId}
        onResetPassword={handleResetPassword}
        isCreateMode={isCreateMode}
        onToggleMode={() => setIsCreateMode(!isCreateMode)}
      />
    </div>
  );
};

export default Login;
