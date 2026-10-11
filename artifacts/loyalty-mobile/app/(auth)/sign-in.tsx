import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { type Href, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function AuthenticationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [step, setStep] = useState<'credentials' | 'verify'>('credentials');
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const fetching =
    busy ||
    signInFetchStatus === 'fetching' ||
    signUpFetchStatus === 'fetching';

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function finishSignIn() {
    await signIn.finalize({
      navigate: async ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage('Complete the remaining account step to continue.');
          return;
        }
        router.replace(decorateUrl('/') as Href);
      },
    });
  }

  async function finishSignUp() {
    await signUp.finalize({
      navigate: async ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage('Complete the remaining account step to continue.');
          return;
        }
        router.replace(decorateUrl('/') as Href);
      },
    });
  }

  async function submitCredentials() {
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const { error } = await signUp.password({
          emailAddress: emailAddress.trim(),
          password,
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        const verification = await signUp.verifications.sendEmailCode();
        if (verification.error) {
          setMessage(verification.error.message);
          return;
        }
        setStep('verify');
        setMessage(`We sent a verification code to ${emailAddress.trim()}.`);
        return;
      }

      const { error } = await signIn.password({
        emailAddress: emailAddress.trim(),
        password,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (signIn.status === 'complete') {
        await finishSignIn();
        return;
      }

      const emailCodeFactor = signIn.supportedSecondFactors.find(
        (factor) => factor.strategy === 'email_code',
      );
      if (
        (signIn.status === 'needs_second_factor' ||
          signIn.status === 'needs_client_trust') &&
        emailCodeFactor
      ) {
        const verification = await signIn.mfa.sendEmailCode();
        if (verification.error) {
          setMessage(verification.error.message);
          return;
        }
        setStep('verify');
        setMessage(`We sent a verification code to ${emailAddress.trim()}.`);
        return;
      }

      setMessage('This account needs another verification method. Try Google sign-in or contact support.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (error) {
          setMessage(error.message);
          return;
        }
        if (signUp.status === 'complete') {
          await finishSignUp();
        } else {
          setMessage('Your account needs another step before it is ready.');
        }
      } else {
        const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
        if (error) {
          setMessage(error.message);
          return;
        }
        if (signIn.status === 'complete') {
          await finishSignIn();
        } else {
          setMessage('That verification step is not complete yet.');
        }
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setMessage('');
    try {
      const result =
        mode === 'sign-up'
          ? await signUp.verifications.sendEmailCode()
          : await signIn.mfa.sendEmailCode();
      if (result.error) setMessage(result.error.message);
      else setMessage(`A new code was sent to ${emailAddress.trim()}.`);
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  }

  async function continueWithGoogle() {
    setMessage('');
    setBusy(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'loyalty-mobile' }),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              setMessage('Complete the remaining account step to continue.');
              return;
            }
            router.replace(decorateUrl('/') as Href);
          },
        });
      } else {
        setMessage('Google sign-in needs one more step. Try email and password instead.');
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode);
    setStep('credentials');
    setCode('');
    setMessage('');
  }

  const isVerification = step === 'verify';

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom,
        },
      ]}
    >
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={18} color={colors.accent} />
          </View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>LoyaltyHub</Text>
        </View>

        <View style={[styles.welcomeCard, { backgroundColor: colors.primary }]}>
          <View style={[styles.welcomeOrb, { borderColor: 'rgba(255,255,255,0.12)' }]} />
          <View style={[styles.welcomeOrb, styles.welcomeOrbSmall, { borderColor: 'rgba(255,255,255,0.12)' }]} />
          <View style={[styles.welcomeSpark, { backgroundColor: colors.accent }]}>
            <Ionicons name="sparkles" size={19} color={colors.primary} />
          </View>
          <Text style={styles.welcomeEyebrow}>GOOD THINGS HAPPEN HERE</Text>
          <Text style={styles.welcomeTitle}>
            {isVerification
              ? 'One quick check.'
              : mode === 'sign-up'
                ? 'Make room for more good things.'
                : 'Welcome back.'}
          </Text>
          <Text style={styles.welcomeBody}>
            {isVerification
              ? 'Confirm your email to finish setting up your Perkind account.'
              : 'Keep your favorite neighborhood places close, with a little something extra for coming back.'}
          </Text>
        </View>

        <View style={styles.formHeader}>
          <Text style={[styles.formTitle, { color: colors.foreground }]}>
            {isVerification
              ? 'Check your email'
              : mode === 'sign-up'
                ? 'Create your account'
                : 'Sign in'}
          </Text>
          <Text style={[styles.formSubtitle, { color: colors.mutedForeground }]}>
            {isVerification
              ? emailAddress.trim()
              : mode === 'sign-up'
                ? 'One account for every little local favorite.'
                : 'Your rewards are right where you left them.'}
          </Text>
        </View>

        {!isVerification ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.foreground }]}>EMAIL ADDRESS</Text>
            <TextInput
              testID="auth-email"
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder="you@example.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Text style={[styles.label, { color: colors.foreground }]}>PASSWORD</Text>
            <TextInput
              testID="auth-password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={() => void submitCredentials()}
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Pressable
              testID="auth-submit"
              onPress={() => void submitCredentials()}
              disabled={fetching || !emailAddress.trim() || password.length < 8}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: fetching || !emailAddress.trim() || password.length < 8 ? 0.52 : pressed ? 0.82 : 1,
                },
              ]}
            >
              {fetching ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    {mode === 'sign-up' ? 'Create account' : 'Continue with email'}
                  </Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.primaryForeground} />
                </>
              )}
            </Pressable>
            {mode === 'sign-up' && <View nativeID="clerk-captcha" />}
            <View style={styles.separatorRow}>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <Text style={[styles.separatorText, { color: colors.mutedForeground }]}>OR</Text>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            </View>
            <Pressable
              testID="google-sign-in"
              onPress={() => void continueWithGoogle()}
              disabled={fetching}
              style={({ pressed }) => [
                styles.googleButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: fetching ? 0.6 : pressed ? 0.72 : 1,
                },
              ]}
            >
              <Ionicons name="logo-google" size={17} color={colors.foreground} />
              <Text style={[styles.googleText, { color: colors.foreground }]}>Continue with Google</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.foreground }]}>VERIFICATION CODE</Text>
            <TextInput
              testID="auth-code"
              value={code}
              onChangeText={setCode}
              placeholder="Enter the code from your email"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={8}
              style={[
                styles.input,
                styles.codeInput,
                { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <Pressable
              testID="verify-email"
              onPress={() => void verifyEmail()}
              disabled={fetching || code.trim().length < 4}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: fetching || code.trim().length < 4 ? 0.52 : pressed ? 0.82 : 1,
                },
              ]}
            >
              {fetching ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verify and continue</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.primaryForeground} />
                </>
              )}
            </Pressable>
            <Pressable onPress={() => void resendCode()} style={styles.textButton}>
              <Text style={[styles.textButtonText, { color: colors.primary }]}>Send a new code</Text>
            </Pressable>
          </View>
        )}

        {!!message && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.messageBox,
              { backgroundColor: colors.secondary },
            ]}
          >
            <Ionicons
              name={message.includes('sent') ? 'mail-outline' : 'information-circle-outline'}
              size={17}
              color={colors.primary}
            />
            <Text style={[styles.messageText, { color: colors.foreground }]}>{message}</Text>
          </View>
        )}

        {!isVerification && (
          <View style={styles.switchMode}>
            <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
              {mode === 'sign-up' ? 'Already have an account?' : 'New to Perkind?'}
            </Text>
            <Pressable
              testID="auth-mode-switch"
              onPress={() => changeMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}
              hitSlop={8}
            >
              <Text style={[styles.switchLink, { color: colors.primary }]}>
                {mode === 'sign-up' ? 'Sign in' : 'Create an account'}
              </Text>
            </Pressable>
          </View>
        )}
        {isVerification && (
          <Pressable
            onPress={() => {
              setStep('credentials');
              setMessage('');
              setCode('');
            }}
            style={styles.textButton}
          >
            <Text style={[styles.textButtonText, { color: colors.primary }]}>Use a different email</Text>
          </Pressable>
        )}
        <Text style={[styles.legalText, { color: colors.mutedForeground }]}>
          Your account keeps your loyalty details private to you.
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { width: '100%', maxWidth: 500, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  brandRow: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 18 },
  brandIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  welcomeCard: { minHeight: 195, borderRadius: 25, padding: 21, justifyContent: 'flex-end', overflow: 'hidden' },
  welcomeOrb: { width: 164, height: 164, borderRadius: 90, borderWidth: 1, position: 'absolute', right: -69, top: -69 },
  welcomeOrbSmall: { width: 113, height: 113, right: -43, top: -43 },
  welcomeSpark: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  welcomeEyebrow: { color: 'rgba(255,255,255,0.65)', fontSize: 9, letterSpacing: 1.6, fontFamily: 'Inter_700Bold', marginBottom: 7 },
  welcomeTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, maxWidth: 280 },
  welcomeBody: { color: 'rgba(255,255,255,0.74)', fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 7, maxWidth: 290 },
  formHeader: { marginTop: 22, marginBottom: 17 },
  formTitle: { fontSize: 21, lineHeight: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  formSubtitle: { fontSize: 11, marginTop: 4, fontFamily: 'Inter_400Regular' },
  form: { gap: 10 },
  label: { fontSize: 9, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', marginTop: 3 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 13, fontFamily: 'Inter_400Regular' },
  codeInput: { letterSpacing: 3, fontFamily: 'Inter_600SemiBold' },
  primaryButton: { minHeight: 49, borderRadius: 15, marginTop: 4, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  separator: { height: StyleSheet.hairlineWidth, flex: 1 },
  separatorText: { fontSize: 8, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  googleButton: { minHeight: 47, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  googleText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  messageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 11, marginTop: 13 },
  messageText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  switchMode: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 19 },
  switchText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  switchLink: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  textButton: { minHeight: 34, justifyContent: 'center', alignItems: 'center' },
  textButtonText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  legalText: { fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 18, fontFamily: 'Inter_400Regular' },
});
