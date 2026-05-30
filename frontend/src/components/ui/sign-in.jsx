import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

const GlassInputWrapper = ({ children }) => (
  <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low/90 backdrop-blur-sm transition-colors focus-within:border-primary/30 focus-within:bg-surface">
    {children}
  </div>
);

const TestimonialCard = ({ testimonial, delay }) => (
  <div className={`animate-testimonial ${delay} flex items-start gap-3 rounded-3xl glass-panel p-5 w-64`}>
    <img
      src={testimonial.avatarSrc}
      className="h-10 w-10 object-cover rounded-2xl shrink-0 aspect-square"
      style={{
        width: '40px',
        height: '40px',
        minWidth: '40px',
        minHeight: '40px',
        flexShrink: 0,
        objectFit: 'cover'
      }}
      alt="avatar"
    />
    <div className="text-sm leading-snug">
      <p className="flex items-center gap-1 font-medium text-on-surface">{testimonial.name}</p>
      <p className="text-on-surface-variant/70">{testimonial.handle}</p>
      <p className="mt-1 text-on-surface/80">{testimonial.text}</p>
    </div>
  </div>
);

export const SignInPage = ({
  title = <span className="font-light text-primary tracking-tighter">Welcome</span>,
  description = 'Access your account and continue your journey with us',
  heroImageSrc,
  testimonials = [],
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateSubmit,
  isCreateMode = false,
  onToggleMode,
  googleClientId,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const googleBtnRef = useRef(null);
  const googleInitializedRef = useRef(false);
  const onGoogleSignInRef = useRef(onGoogleSignIn);

  useEffect(() => {
    onGoogleSignInRef.current = onGoogleSignIn;
  }, [onGoogleSignIn]);

  useEffect(() => {
    if (!googleClientId || !window.google?.accounts?.id || !googleBtnRef.current) return;

    const parseJwt = (token) => {
      try {
        const payload = token?.split('.')?.[1];
        if (!payload) return null;

        let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4;
        if (pad) base64 += '='.repeat(4 - pad);

        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json);
      } catch {
        return null;
      }
    };

    if (!googleInitializedRef.current) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          const profile = parseJwt(response?.credential || '');
          if (!profile?.email) {
            console.error('Google credential parse failed', { response });
            return;
          }
          onGoogleSignInRef.current?.({
            email: profile.email,
            name: profile.name || profile.given_name || 'Google User',
            picture: profile.picture || null,
            credential: response.credential,
          });
        },
        ux_mode: 'popup',
        auto_select: false,
      });
      googleInitializedRef.current = true;
    }

    googleBtnRef.current.innerHTML = '';
    const buttonWidth = googleBtnRef.current.offsetWidth || 380;
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      text: 'continue_with',
      shape: 'pill',
      width: buttonWidth,
    });
  }, [googleClientId]);

  return (
    <div className="min-h-screen md:h-[100dvh] flex flex-col md:flex-row font-display w-full bg-surface-container-lowest text-on-surface overflow-y-auto md:overflow-hidden">
      <section className="flex-1 flex flex-col items-center p-6 sm:p-8 md:overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-md my-auto">
          <div className="flex flex-col gap-6">
            <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight text-primary">{title}</h1>
            {description && (
              <p className="animate-element animate-delay-200 text-on-surface-variant/80 text-sm">{description}</p>
            )}

            {!isCreateMode ? (
              <form className="space-y-5" onSubmit={onSignIn}>
                <div className="animate-element animate-delay-300">
                  <label className="text-sm font-medium text-on-surface-variant/80">Corporate Email</label>
                  <GlassInputWrapper>
                    <input
                      name="email"
                      type="email"
                      placeholder="name@company.ai"
                      required
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                    />
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-400">
                  <label className="text-sm font-medium text-on-surface-variant/80">Security Key</label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="********"
                        required
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center">
                        {showPassword ? <EyeOff className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" /> : <Eye className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" />}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="rememberMe" className="rounded border-outline-variant/50 bg-surface-container-low text-primary focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer" />
                    <span className="text-on-surface-variant select-none">Keep me signed in</span>
                  </label>
                  <a href="#" onClick={(e) => { e.preventDefault(); onResetPassword?.(); }} className="hover:underline text-primary/80 hover:text-primary transition-colors">Reset password</a>
                </div>

                <button type="submit" className="animate-element animate-delay-600 w-full rounded-2xl bg-primary text-black py-4 font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer text-sm">
                  Sign In
                </button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={onCreateSubmit}>
                <div className="animate-element animate-delay-300">
                  <label className="text-sm font-medium text-on-surface-variant/80">Full Name</label>
                  <GlassInputWrapper>
                    <input
                      name="name"
                      type="text"
                      placeholder="e.g. Sarah Chen"
                      required
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                    />
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-350">
                  <label className="text-sm font-medium text-on-surface-variant/80">Corporate Email</label>
                  <GlassInputWrapper>
                    <input
                      name="email"
                      type="email"
                      placeholder="name@company.ai"
                      required
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                    />
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-400">
                  <label className="text-sm font-medium text-on-surface-variant/80">Security Key</label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="********"
                        required
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center">
                        {showPassword ? <EyeOff className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" /> : <Eye className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" />}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <div className="animate-element animate-delay-450">
                  <label className="text-sm font-medium text-on-surface-variant/80">Confirm Security Key</label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="********"
                        required
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-on-surface placeholder:text-on-surface-variant/40"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-3 flex items-center">
                        {showConfirmPassword ? <EyeOff className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" /> : <Eye className="w-5 h-5 text-on-surface-variant/60 hover:text-primary transition-colors" />}
                      </button>
                    </div>
                  </GlassInputWrapper>
                </div>

                <button type="submit" className="animate-element animate-delay-600 w-full rounded-2xl bg-primary text-black py-4 font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer text-sm">
                  Create Account
                </button>
              </form>
            )}

            <div className="animate-element animate-delay-700 relative flex items-center justify-center py-2">
              <span className="w-full border-t border-outline-variant/30"></span>
              <span className="px-4 text-xs text-on-surface-variant/70 bg-surface-container-lowest absolute">Or continue with</span>
            </div>

            <div className="animate-element animate-delay-800 w-full relative">
              <button
                type="button"
                onClick={!googleClientId ? onGoogleSignIn : undefined}
                className="w-full flex items-center justify-center gap-3 border border-outline-variant/40 rounded-2xl py-4 hover:bg-white/5 transition-colors cursor-pointer text-sm font-semibold text-on-surface"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              {googleClientId && (
                <div
                  ref={googleBtnRef}
                  className="absolute inset-0 opacity-0 overflow-hidden"
                />
              )}
            </div>

            <p className="animate-element animate-delay-900 text-center text-sm text-on-surface-variant/70">
              {!isCreateMode ? (
                <>
                  New to our platform?{' '}
                  <button type="button" onClick={onToggleMode} className="text-primary font-bold hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 inline">
                    Create Account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" onClick={onToggleMode} className="text-primary font-bold hover:underline transition-colors cursor-pointer bg-transparent border-none p-0 inline">
                    Sign In
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${heroImageSrc})` }}></div>
          <div className="absolute inset-4 rounded-3xl bg-gradient-to-t from-black/85 via-black/10 to-transparent pointer-events-none"></div>
          {testimonials.length > 0 && (
            <div className="absolute bottom-8 left-0 right-0 flex gap-4 px-8 w-full justify-center">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
              {testimonials[2] && <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
