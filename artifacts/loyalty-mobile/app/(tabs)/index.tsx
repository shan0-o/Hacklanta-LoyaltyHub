import React, { useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useClerk, useUser } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import {
  Business,
  Campaign,
  CampaignType,
  Member,
  getLoyaltyErrorMessage,
  useLoyalty,
} from '@/context/LoyaltyContext';
import { ProgramEditorModal } from '@/components/ProgramEditorModal';
import { MerchantStaffPin } from '@/components/MerchantStaffPin';
import { LoyaltyActionModal } from '@/components/LoyaltyActionModal';
import { MerchantActivityChart } from '@/components/MerchantActivityChart';

type Role = 'customer' | 'merchant';
type CustomerTab = 'cards' | 'discover' | 'updates';
type MerchantTab = 'overview' | 'manage' | 'members';
type AppTab = CustomerTab | MerchantTab;
const currencyPoints = (value: number) => new Intl.NumberFormat('en-US').format(value);
const campaignTypes: CampaignType[] = [
  'Promotion',
  'Reward',
  'Tier',
  'Event',
  'Giveaway',
];


export default function LoyaltyHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const { user } = useUser();
  const {
    businesses,
    favorites,
    notices,
    ready,
    loading,
    error,
    refresh,
    toggleFavorite,
    joinBusiness,
    createBusiness,
    updateBusiness,
    seedDemo,
    saveCampaign,
    deleteCampaign,
    toggleCampaign,
    requestStamp,
    redeemReward,
    markNoticeRead,
  } = useLoyalty();
  const [role, setRole] = useState<Role>('customer');
  const [tab, setTab] = useState<AppTab>('cards');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<CampaignType | 'All'>('All');
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [actionRequest, setActionRequest] = useState<{
    business: Business;
    mode: 'stamp' | 'redeem';
    key: string;
  } | null>(null);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [campaignType, setCampaignType] = useState<CampaignType>('Promotion');
  const [campaignActive, setCampaignActive] = useState(true);
  const [campaignStartDate, setCampaignStartDate] = useState('');
  const [campaignEndDate, setCampaignEndDate] = useState('');
  const [campaignBoost, setCampaignBoost] = useState<'standard' | 'double' | 'bonus'>('standard');
  const [campaignError, setCampaignError] = useState('');
  const [campaignSaving, setCampaignSaving] = useState(false);

  const ownedBusinesses = businesses.filter((business) => business.isOwner);
  const primaryBusiness =
    ownedBusinesses.find((business) => business.id === selectedBusinessId) ??
    ownedBusinesses[0];
  const currentCustomerCards = businesses
    .map((business) => ({
      business,
      member: business.members.find((person) => person.isCurrentUser),
    }))
    .filter(
      (item): item is { business: Business; member: Member } =>
        item.member !== undefined,
    );
  const unreadCount = notices.filter((notice) => !notice.read).length;
  const accountName =
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress.split('@')[0] ??
    'there';

  const merchantStats = primaryBusiness?.analytics ?? {
    members: 0,
    stamps: 0,
    redemptions: 0,
    repeatPercent: 0,
    activeCampaigns: 0,
    newMembers: 0,
    activity: [],
    recentTransactions: [],
  };

  const visibleCampaigns =
    primaryBusiness?.campaigns.filter(
      (campaign) =>
        campaignFilter === 'All' || campaign.type === campaignFilter,
    ) ?? [];

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setTab(nextRole === 'customer' ? 'cards' : 'overview');
  }

  function openNewCampaign(type: CampaignType = 'Promotion') {
    setEditingCampaign(null);
    setCampaignTitle('');
    setCampaignDescription('');
    setCampaignType(type);
    setCampaignActive(true);
    setCampaignStartDate('');
    setCampaignEndDate('');
    setCampaignBoost('standard');
    setCampaignError('');
    setShowCampaignForm(true);
  }

  function openEditCampaign(campaign: Campaign) {
    setEditingCampaign(campaign);
    setCampaignTitle(campaign.title);
    setCampaignDescription(campaign.description);
    setCampaignType(campaign.type);
    setCampaignActive(campaign.active);
    setCampaignStartDate(campaign.startAt?.slice(0, 10) ?? '');
    setCampaignEndDate(campaign.endAt?.slice(0, 10) ?? '');
    setCampaignBoost(
      campaign.multiplier > 1
        ? 'double'
        : campaign.bonusStamps > 0
          ? 'bonus'
          : 'standard',
    );
    setCampaignError('');
    setShowCampaignForm(true);
  }

  function dateInputToIso(value: string, endOfDay = false) {
    if (!value.trim()) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return undefined;
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const date = new Date(`${value.trim()}${suffix}`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.trim() ? undefined : date.toISOString();
  }

  async function submitCampaign() {
    if (campaignSaving) return;
    if (!campaignTitle.trim()) {
      setCampaignError('Add a name for this campaign.');
      return;
    }
    if (!campaignDescription.trim()) {
      setCampaignError('Add a short description customers will see.');
      return;
    }
    const startAt = campaignType === 'Promotion' ? dateInputToIso(campaignStartDate) : null;
    const endAt = campaignType === 'Promotion' ? dateInputToIso(campaignEndDate, true) : null;
    if (startAt === undefined || endAt === undefined || (startAt && endAt && endAt <= startAt)) {
      setCampaignError('Use YYYY-MM-DD dates and make sure the end date is after the start.');
      return;
    }
    const multiplier = campaignType === 'Promotion' && campaignBoost === 'double' ? 2 : 1;
    const bonusStamps = campaignType === 'Promotion' && campaignBoost === 'bonus' ? 1 : 0;
    setCampaignSaving(true);
    try {
      await saveCampaign(primaryBusiness!.id, {
        id: editingCampaign?.id,
        type: campaignType,
        title: campaignTitle,
        description: campaignDescription,
        active: campaignActive,
        startAt,
        endAt,
        multiplier,
        bonusStamps,
      });
      setShowCampaignForm(false);
    } catch (submitError) {
      setCampaignError(getLoyaltyErrorMessage(submitError));
    } finally {
      setCampaignSaving(false);
    }
  }

  function confirmDelete(campaign: Campaign) {
    const remove = () =>
      void deleteCampaign(primaryBusiness!.id, campaign.id).catch((deleteError) =>
        Alert.alert('Campaign not deleted', getLoyaltyErrorMessage(deleteError)),
      );
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Delete “${campaign.title}”?`))
        remove();
    } else {
      Alert.alert('Delete campaign?', `“${campaign.title}” will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ]);
    }
  }

  function doRedeem(business: Business, member: Member) {
    if (!member.isCurrentUser) return;
    setActionRequest({ business, mode: 'redeem', key: `${business.id}-${Date.now()}` });
  }

  function requestCustomerStamp(business: Business, member?: Member) {
    if (member && !member.isCurrentUser) return;
    setActionRequest({ business, mode: 'stamp', key: `${business.id}-${Date.now()}` });
  }

  async function handleActionConfirm(staffPin: string, idempotencyKey: string) {
    if (!actionRequest) throw new Error('This loyalty request is no longer active.');
    return actionRequest.mode === 'stamp'
      ? requestStamp(actionRequest.business.id, staffPin, idempotencyKey)
      : redeemReward(actionRequest.business.id, staffPin, idempotencyKey);
  }

  async function handleJoin(business: Business) {
    try {
      await joinBusiness(business.id, user?.firstName ?? accountName);
    } catch (joinError) {
      Alert.alert('Could not join this program', getLoyaltyErrorMessage(joinError));
    }
  }

  async function handleProgramSave(
    input: import('@workspace/api-client-react').BusinessInput,
    businessId?: string,
  ) {
    if (businessId) {
      await updateBusiness(businessId, input);
    } else {
      await createBusiness(input as import('@workspace/api-client-react').BusinessInput);
      setRole('merchant');
      setTab('overview');
    }
    setShowProgramForm(false);
  }

  async function handleSeedDemo() {
    try {
      await seedDemo(user?.firstName ?? accountName);
    } catch (seedError) {
      Alert.alert('Demo data could not be loaded', getLoyaltyErrorMessage(seedError));
    }
  }

  const navigation: { id: AppTab; title: string; icon: string }[] =
    role === 'customer'
      ? [
          { id: 'cards', title: 'My Cards', icon: 'albums-outline' },
          { id: 'discover', title: 'Discover', icon: 'compass-outline' },
        ]
      : [
          { id: 'overview', title: 'Overview', icon: 'grid-outline' },
          { id: 'manage', title: 'Manage', icon: 'pricetags-outline' },
          { id: 'members', title: 'Members', icon: 'people-outline' },
        ];

  if (loading && !ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.foreground }]}>Loading your loyalty programs…</Text>
      </View>
    );
  }
  if (error && !ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingMark, { backgroundColor: colors.accent }]}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.loadingText, { color: colors.foreground }]}>Your loyalty data could not load.</Text>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
        <Pressable
          onPress={() => void refresh()}
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.retryButtonText, { color: colors.primaryForeground }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const headerTitle =
    role === 'merchant'
      ? tab === 'overview'
        ? 'Good morning'
        : tab === 'manage'
          ? 'Your campaigns'
          : 'Loyalty members'
      : tab === 'cards'
        ? `Hello, ${accountName}!`
        : tab === 'discover'
          ? 'Find your next favorite'
          : 'A little good news';

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top,
        },
      ]}
    >
      <View style={styles.topBar}>
        <View style={styles.brandLockup}>
          <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={15} color={colors.accent} />
          </View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>LoyaltyHub</Text>
        </View>
        <View style={styles.topActions}>
          {role === 'customer' && (
            <Pressable
              testID="notifications-button"
              onPress={() => setTab(tab === 'updates' ? 'cards' : 'updates')}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel="Open reward updates"
            >
              <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
              {unreadCount > 0 && <View style={styles.notificationDot} />}
            </Pressable>
          )}
          <Pressable
            testID="sign-out"
            onPress={() => void signOut()}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={19} color={colors.foreground} />
          </Pressable>
          <Pressable
            testID="role-switch"
            onPress={() => switchRole(role === 'customer' ? 'merchant' : 'customer')}
            style={[styles.roleChip, { backgroundColor: colors.secondary }]}
          >
            <Ionicons
              name={role === 'customer' ? 'storefront-outline' : 'person-outline'}
              size={15}
              color={colors.foreground}
            />
            <Text style={[styles.roleChipText, { color: colors.foreground }]}>
              {role === 'customer' ? 'Merchant' : 'Customer'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
          {role === 'merchant'
            ? primaryBusiness?.name.toUpperCase() ?? 'MERCHANT WORKSPACE'
            : tab === 'updates'
              ? 'YOUR REWARDS'
              : 'YOUR NEIGHBORHOOD, REWARDED'}
        </Text>
        <View style={styles.headingRow}>
          <View style={styles.flexOne}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>{headerTitle}</Text>
            {role === 'customer' && tab === 'cards' && (
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground, marginTop: 4 }]}>
                Your local rewards, all in one place.
              </Text>
            )}
          </View>
          {role === 'merchant' && !!primaryBusiness && tab === 'manage' && (
            <Pressable
              testID="new-campaign"
              onPress={() => openNewCampaign(campaignFilter === 'All' ? 'Promotion' : campaignFilter)}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="add" size={21} color={colors.primaryForeground} />
              <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>
                New
              </Text>
            </Pressable>
          )}
        </View>

        {role === 'merchant' && ownedBusinesses.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.businessPicker}
          >
            {ownedBusinesses.map((business) => {
              const selected = business.id === primaryBusiness?.id;
              return (
                <Pressable
                  key={business.id}
                  onPress={() => setSelectedBusinessId(business.id)}
                  style={[
                    styles.businessChip,
                    { backgroundColor: selected ? colors.primary : colors.secondary },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.businessChipText,
                      { color: selected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {business.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {role === 'customer' &&
          (tab === 'cards' || tab === 'discover' || tab === 'updates') && (
            <CustomerContent
              tab={tab}
              colors={colors}
              businesses={businesses}
              cards={currentCustomerCards}
              favorites={favorites}
              notices={notices}
              onFavorite={(id) => void toggleFavorite(id).catch((favoriteError) =>
                Alert.alert('Favorite not updated', getLoyaltyErrorMessage(favoriteError)),
              )}
              onRedeem={doRedeem}
              onRequestStamp={requestCustomerStamp}
              onJoin={handleJoin}
              onReadNotice={(id) => void markNoticeRead(id).catch((noticeError) =>
                Alert.alert('Update not saved', getLoyaltyErrorMessage(noticeError)),
              )}
              onOpenCards={() => setTab('cards')}
              onOpenDiscover={() => setTab('discover')}
            />
          )}

        {role === 'merchant' && !primaryBusiness && (
          <View style={[styles.emptyMerchant, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyMerchantIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="storefront-outline" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.emptyMerchantTitle, { color: colors.foreground }]}>Set up your loyalty program</Text>
            <Text style={[styles.emptyMerchantText, { color: colors.mutedForeground }]}>
              Create a business and set the reward goal. LoyaltyHub generates a private four-digit staff code that changes every three hours.
            </Text>
            <Pressable
              testID="create-business"
              onPress={() => setShowProgramForm(true)}
              style={[styles.primaryWideButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryWideButtonText, { color: colors.primaryForeground }]}>Create a business</Text>
            </Pressable>
            <Pressable
              testID="load-demo-businesses"
              onPress={() => void handleSeedDemo()}
              style={[styles.secondaryWideButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.secondaryWideButtonText, { color: colors.foreground }]}>Explore clearly marked demo data</Text>
            </Pressable>
          </View>
        )}

        {role === 'merchant' && primaryBusiness && tab === 'overview' && (
          <MerchantOverview
            business={primaryBusiness}
            stats={merchantStats}
            colors={colors}
            onManage={() => setTab('manage')}
            onMembers={() => setTab('members')}
            onEditProgram={() => setShowProgramForm(true)}
            onToggleProgram={() => void updateBusiness(primaryBusiness.id, { active: !primaryBusiness.active }).catch(err =>
              Alert.alert('Program not updated', getLoyaltyErrorMessage(err)),
            )}
          />
        )}
        {role === 'merchant' && primaryBusiness && tab === 'manage' && (
          <MerchantManage
            campaigns={visibleCampaigns}
            selectedFilter={campaignFilter}
            colors={colors}
            onFilter={setCampaignFilter}
            onNew={openNewCampaign}
            onEdit={openEditCampaign}
            onDelete={confirmDelete}
            onToggle={(campaignId) => void toggleCampaign(primaryBusiness.id, campaignId).catch((toggleError) =>
              Alert.alert('Campaign not updated', getLoyaltyErrorMessage(toggleError)),
            )}
          />
        )}
        {role === 'merchant' && primaryBusiness && tab === 'members' && (
          <MerchantMembers
            business={primaryBusiness}
            colors={colors}
          />
        )}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 8),
          },
        ]}
      >
        {navigation.map((item) => {
          const active = item.id === tab;
          return (
            <Pressable
              key={item.id}
              testID={`tab-${item.id}`}
              onPress={() => setTab(item.id)}
              style={({ pressed }) => [styles.navItem, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons
                name={item.icon as React.ComponentProps<typeof Ionicons>['name']}
                size={21}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primary : colors.mutedForeground },
                  active && styles.navLabelActive,
                ]}
              >
                {item.title}
              </Text>
              {active && <View style={[styles.navDot, { backgroundColor: colors.accent }]} />}
            </Pressable>
          );
        })}
      </View>

      <CampaignModal
        visible={showCampaignForm}
        title={campaignTitle}
        description={campaignDescription}
        type={campaignType}
        active={campaignActive}
        error={campaignError}
        saving={campaignSaving}
        editing={!!editingCampaign}
        colors={colors}
        onClose={() => setShowCampaignForm(false)}
        onChangeTitle={setCampaignTitle}
        onChangeDescription={setCampaignDescription}
        onChangeType={setCampaignType}
        onToggleActive={() => setCampaignActive((value) => !value)}
        startDate={campaignStartDate}
        endDate={campaignEndDate}
        promotionBoost={campaignBoost}
        onChangeStartDate={setCampaignStartDate}
        onChangeEndDate={setCampaignEndDate}
        onChangePromotionBoost={setCampaignBoost}
        onSubmit={submitCampaign}
      />
      {showProgramForm && <ProgramEditorModal
        visible={showProgramForm}
        business={primaryBusiness ?? null}
        onClose={() => setShowProgramForm(false)}
        onSave={handleProgramSave}
      />}
      <LoyaltyActionModal
        key={actionRequest?.key ?? 'closed-loyalty-action'}
        visible={!!actionRequest}
        business={actionRequest?.business ?? null}
        mode={actionRequest?.mode ?? 'stamp'}
        expectedStamps={actionRequest?.mode === 'stamp' ? expectedStampCount(actionRequest.business) : 0}
        promotion={actionRequest?.mode === 'stamp' ? activePromotionDescription(actionRequest.business) : null}
        onClose={() => setActionRequest(null)}
        onConfirm={handleActionConfirm}
      />
    </View>
  );
}

function activePromotion(business: Business) {
  const now = Date.now();
  return business.campaigns.find((campaign) => {
    if (campaign.type !== 'Promotion' || !campaign.active) return false;
    const startsAt = campaign.startAt ? Date.parse(campaign.startAt) : 0;
    const endsAt = campaign.endAt ? Date.parse(campaign.endAt) : Number.POSITIVE_INFINITY;
    return startsAt <= now && endsAt >= now;
  });
}

function expectedStampCount(business: Business) {
  const promotion = activePromotion(business);
  return promotion ? promotion.multiplier + promotion.bonusStamps : 1;
}

function activePromotionDescription(business: Business) {
  const promotion = activePromotion(business);
  if (!promotion) return null;
  const benefit =
    promotion.multiplier > 1
      ? `${promotion.multiplier}× stamps`
      : promotion.bonusStamps > 0
        ? `+${promotion.bonusStamps} bonus stamp`
        : 'standard stamps';
  return `${promotion.title} · ${benefit}`;
}

function CustomerContent({
  tab,
  colors,
  businesses,
  cards,
  favorites,
  notices,
  onFavorite,
  onRedeem,
  onRequestStamp,
  onJoin,
  onReadNotice,
  onOpenCards,
  onOpenDiscover,
}: {
  tab: CustomerTab;
  colors: ReturnType<typeof useColors>;
  businesses: Business[];
  cards: { business: Business; member: Member }[];
  favorites: string[];
  notices: ReturnType<typeof useLoyalty>['notices'];
  onFavorite: (id: string) => void;
  onRedeem: (business: Business, member: Member) => void;
  onRequestStamp: (business: Business, member?: Member) => void;
  onJoin: (business: Business) => void;
  onReadNotice: (id: string) => void;
  onOpenCards: () => void;
  onOpenDiscover: () => void;
}) {
  if (tab === 'updates') {
    return (
      <View style={styles.sectionStack}>
        {notices.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="Your next reward is on its way"
            detail="When a stamp card is full, we’ll save the good news here."
            colors={colors}
          />
        ) : (
          notices.map((notice) => {
            const business = businesses.find((item) => item.id === notice.businessId);
            return (
              <Pressable
                key={notice.id}
                testID={`notice-${notice.id}`}
                onPress={() => {
                  onReadNotice(notice.id);
                  onOpenCards();
                }}
                style={[
                  styles.noticeCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.noticeIcon, { backgroundColor: colors.accent }]}>
                  <Ionicons name="gift-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                    {business?.name ?? 'Reward unlocked'}
                  </Text>
                  <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                    {notice.message}
                  </Text>
                </View>
                {!notice.read && <View style={styles.unreadMark} />}
              </Pressable>
            );
          })
        )}
      </View>
    );
  }

  if (tab === 'discover') {
    const active = businesses.filter((business) => business.active);
    const isJoined = (business: Business) =>
      business.members.some((person) => person.isCurrentUser);
    const seen = new Set<string>();
    const recommendations = active
      .filter((business) => !isJoined(business))
      .filter((business) => (seen.has(business.id) ? false : (seen.add(business.id), true)))
      .sort((x, y) => Number(favorites.includes(y.id)) - Number(favorites.includes(x.id)));
    const joined = active.filter(isJoined);
    return (
      <View style={styles.sectionStack}>
        <Text style={[styles.sectionIntro, { color: colors.mutedForeground }]}>
          Good people, good places, a little something extra for coming back.
        </Text>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>A place to try next</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
              Loyalty programs you have not joined yet
            </Text>
          </View>
        </View>
        {recommendations.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="You're all caught up!"
            detail="You've discovered all participating businesses for now. Check back for new local spots!"
            colors={colors}
          />
        ) : (
          recommendations.map((business) => (
            <StoreCard
              key={business.id}
              business={business}
              favorite={favorites.includes(business.id)}
              colors={colors}
              onFavorite={() => onFavorite(business.id)}
              onJoin={() => onJoin(business)}
            />
          ))
        )}
        {joined.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Already joined</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                  Current promotions from your places
                </Text>
              </View>
            </View>
            {joined.map((business) => (
              <StoreCard
                key={business.id}
                business={business}
                favorite={favorites.includes(business.id)}
                member={business.members.find((person) => person.isCurrentUser)}
                colors={colors}
                onFavorite={() => onFavorite(business.id)}
                onJoin={() => onJoin(business)}
              />
            ))}
          </>
        )}
      </View>
    );
  }

  const sortedCards = [...cards].sort(
    (x, y) =>
      Number(y.member.stamps >= y.business.goal) - Number(x.member.stamps >= x.business.goal),
  );
  if (sortedCards.length === 0) {
    return (
      <View style={styles.sectionStack}>
        <EmptyState
          icon="albums-outline"
          title="Your rewards start here!"
          detail="You haven't joined any loyalty programs yet. Discover local businesses and start earning rewards."
          colors={colors}
        />
        <Pressable
          testID="discover-businesses"
          onPress={onOpenDiscover}
          style={({ pressed }) => [
            styles.primaryWideButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.primaryWideButtonText, { color: colors.primaryForeground }]}>
            Discover Businesses
          </Text>
        </Pressable>
        <PastActivity cards={cards} colors={colors} />
      </View>
    );
  }
  return (
    <View style={styles.sectionStack}>
      {sortedCards.map(({ business, member }) => (
        <StampCard
          key={business.id}
          business={business}
          member={member}
          colors={colors}
          onRedeem={() => onRedeem(business, member)}
          onRequestStamp={() => onRequestStamp(business, member)}
        />
      ))}
      <Pressable
        onPress={onOpenDiscover}
        style={({ pressed }) => [
          styles.outlineAction,
          { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Ionicons name="add-circle-outline" size={19} color={colors.primary} />
        <Text style={[styles.outlineActionText, { color: colors.primary }]}>
          Find another neighborhood favorite
        </Text>
      </Pressable>
      <PastActivity cards={cards} colors={colors} />
    </View>
  );
}

function PastActivity({
  cards,
  colors,
}: {
  cards: { business: Business; member: Member }[];
  colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () =>
      cards
        .flatMap(({ business }) =>
          (business.history ?? []).map((item) => ({ item, businessName: business.name })),
        )
        .sort((x, y) => Date.parse(y.item.createdAt) - Date.parse(x.item.createdAt)),
    [cards],
  );
  return (
    <View style={[styles.storeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        testID="past-activity-toggle"
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.storeCardHeader, { alignItems: 'center' }]}
      >
        <View style={[styles.storeMark, { backgroundColor: colors.secondary }]}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.flexOne}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Past Activity</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {items.length} {items.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
      </Pressable>
      {open && (
        <View style={{ gap: 10 }}>
          {items.length === 0 ? (
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              No activity yet. Your approved visits and redeemed rewards will show up here.
            </Text>
          ) : (
            items.map(({ item, businessName }) => {
              const isStamp = item.type === 'stamp';
              const bonus = isStamp ? Math.max(item.stamps - 1, 0) : 0;
              return (
                <View
                  key={item.id}
                  style={{ flexDirection: 'row', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}
                >
                  <Ionicons
                    name={isStamp ? 'add-circle-outline' : 'gift-outline'}
                    size={18}
                    color={colors.primary}
                  />
                  <View style={styles.flexOne}>
                    <Text style={[styles.rewardName, { color: colors.foreground }]}>{businessName}</Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {isStamp
                        ? `${item.stamps} ${item.stamps === 1 ? 'stamp' : 'stamps'} earned${bonus > 0 ? ` · includes ${bonus} bonus` : ''}`
                        : `Reward redeemed · ${item.description}`}
                    </Text>
                  </View>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

function StampCard({
  business,
  member,
  colors,
  onRedeem,
  onRequestStamp,
  compact = false,
}: {
  business: Business;
  member: Member;
  colors: ReturnType<typeof useColors>;
  onRedeem: () => void;
  onRequestStamp: () => void;
  compact?: boolean;
}) {
  const complete = member.stamps >= business.goal;
  const pointsLeft = Math.max(business.goal - member.stamps, 0);
  return (
    <View
      style={[
        styles.stampCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        compact && styles.stampCardCompact,
      ]}
    >
      <View style={styles.storeCardHeader}>
        <View style={[styles.storeMark, { backgroundColor: colors.secondary }]}>
          {business.logoUrl ? <Image source={{ uri: business.logoUrl }} style={{ width: 36, height: 36, borderRadius: 10 }} /> : <Ionicons name="cafe-outline" size={20} color={colors.primary} />}
        </View>
        <View style={styles.flexOne}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {business.name}
          </Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {business.programName}
          </Text>
        </View>
        <View style={[styles.stampCount, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.stampCountText, { color: colors.primary }]}>
            {member.stamps}/{business.goal}
          </Text>
        </View>
      </View>
      {activePromotionDescription(business) && (
        <Text style={[styles.bodyText, { color: colors.primary }]}>{activePromotionDescription(business)}</Text>
      )}
      {business.isDemo && <Text style={[styles.caption, { color: colors.mutedForeground }]}>DEMO · Sample loyalty program</Text>}
      {!business.active && <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Program paused. Your stamps are saved.</Text>}
      <View style={styles.stampGrid}>
        {Array.from({ length: business.goal }, (_, index) => {
          const filled = index < member.stamps;
          return (
            <View
              key={`${business.id}-stamp-${index}`}
              style={[
                styles.stampDot,
                {
                  backgroundColor: filled ? colors.primary : colors.background,
                  borderColor: filled ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons
                name={filled ? 'checkmark' : 'cafe-outline'}
                size={filled ? 14 : 13}
                color={filled ? colors.accent : colors.mutedForeground}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.flexOne}>
          <Text style={[styles.rewardName, { color: colors.foreground }]}>
            {complete ? 'Your reward is ready' : business.programName}
          </Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {complete
              ? `${business.rewardDescription} · 0 stamps remaining · ${Math.max(member.stamps - business.goal, 0)} extra stamps saved`
              : `${pointsLeft} more ${pointsLeft === 1 ? 'stamp' : 'stamps'} to go · ${business.rewardDescription}`}
          </Text>
        </View>
        <View style={styles.cardActionRow}>
          <Pressable
            testID={`request-stamp-${business.id}`}
            onPress={onRequestStamp}
            disabled={!business.active}
            style={({ pressed }) => [
              styles.redeemButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.redeemText, { color: colors.primaryForeground }]}>Get Stamp</Text>
          </Pressable>
          {complete && business.active && (
            <Pressable
              testID={`redeem-${business.id}`}
              onPress={onRedeem}
              style={({ pressed }) => [
                styles.redeemButton,
                { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.redeemText, { color: colors.primary }]}>Redeem Reward</Text>
            </Pressable>
          )}
        </View>
      </View>
      {!compact && (
        <View style={{ gap: 6 }}>
          {!!business.terms && <Text style={[styles.caption, { color: colors.mutedForeground }]}>{business.terms}</Text>}
        </View>
      )}
    </View>
  );
}

function StoreCard({
  business,
  favorite,
  member,
  colors,
  onFavorite,
  onJoin,
}: {
  business: Business;
  favorite: boolean;
  member?: Member;
  colors: ReturnType<typeof useColors>;
  onFavorite: () => void;
  onJoin: () => void;
}) {
  const offer = business.campaigns.find((campaign) => {
    const startsAt = campaign.startAt ? Date.parse(campaign.startAt) : 0;
    const endsAt = campaign.endAt ? Date.parse(campaign.endAt) : Number.POSITIVE_INFINITY;
    return campaign.active && startsAt <= Date.now() && endsAt >= Date.now();
  });
  return (
    <View style={[styles.storeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.storeCardHeader}>
        <View style={[styles.storeMark, { backgroundColor: colors.secondary }]}>
          <Ionicons name="storefront-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.flexOne}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{business.name}</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {business.category}
          </Text>
        </View>
        <Pressable
          testID={`favorite-${business.id}`}
          onPress={onFavorite}
          style={styles.favoriteButton}
          accessibilityLabel={favorite ? 'Remove favorite' : 'Add favorite'}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={21}
            color={favorite ? colors.destructive : colors.mutedForeground}
          />
        </Pressable>
      </View>
      <View style={styles.storeDetailsRow}>
        <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>{business.location}</Text>
        <View style={styles.detailSpacer} />
        {!!business.isDemo && (
          <View style={[styles.demoPill, { backgroundColor: colors.accent }]}>
            <Text style={[styles.demoPillText, { color: colors.primary }]}>DEMO</Text>
          </View>
        )}
      </View>
      <View style={[styles.offerLine, { backgroundColor: colors.background }]}>
        <Ionicons name="albums-outline" size={15} color={colors.primary} />
        <Text style={[styles.offerText, { color: colors.foreground }]} numberOfLines={2}>
          {business.programName} · {business.goal} stamps for {business.rewardDescription}
        </Text>
        {member && (
          <Text style={[styles.memberPoints, { color: colors.mutedForeground }]}>
            {member.stamps}/{business.goal}
          </Text>
        )}
      </View>
      {offer && (
        <View style={[styles.offerLine, { backgroundColor: colors.background }]}>
          <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
          <Text style={[styles.offerText, { color: colors.foreground }]} numberOfLines={2}>
            {offer.title}
          </Text>
        </View>
      )}
      {member && (
        <View style={[styles.demoPill, { backgroundColor: colors.accent, alignSelf: 'flex-start' }]}>
          <Text style={[styles.demoPillText, { color: colors.primary }]}>JOINED</Text>
        </View>
      )}
      {!member && (
        <Pressable
          testID={`join-${business.id}`}
          onPress={onJoin}
          style={({ pressed }) => [
            styles.joinButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          <Text style={[styles.joinButtonText, { color: colors.primaryForeground }]}>
            Join this loyalty card
          </Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
        </Pressable>
      )}
    </View>
  );
}

function MerchantOverview({
  business,
  stats,
  colors,
  onManage,
  onMembers,
  onEditProgram,
  onToggleProgram,
}: {
  business: Business;
  stats: NonNullable<Business['analytics']>;
  colors: ReturnType<typeof useColors>;
  onManage: () => void;
  onMembers: () => void;
  onEditProgram: () => void;
  onToggleProgram: () => void;
}) {
  const metricCards = [
    { title: 'Loyalty members', value: stats.members.toString(), icon: 'people-outline' },
    { title: 'Stamps rewarded', value: currencyPoints(stats.stamps), icon: 'albums-outline' },
    { title: 'Rewards redeemed', value: stats.redemptions.toString(), icon: 'gift-outline' },
    { title: 'Repeat customers', value: `${stats.repeatPercent}%`, icon: 'repeat-outline' },
    { title: 'New members · 30 days', value: stats.newMembers.toString(), icon: 'person-add-outline' },
    { title: 'Approved visits', value: String(stats.approvedVisits ?? 0), icon: 'checkmark-circle-outline' },
    { title: 'Rewards available now', value: String(stats.rewardsAvailable ?? 0), icon: 'gift-outline' },
    { title: 'Rewards earned · current goal', value: String(stats.redemptions + (stats.rewardsAvailable ?? 0)), icon: 'ribbon-outline' },
    { title: 'Active promotions', value: String(stats.activePromotions ?? 0), icon: 'megaphone-outline' },
  ];
  return (
    <View style={styles.sectionStack}>
      {business.isDemo && (
        <View style={[styles.repeatCard, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Guided demo · sample data</Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
            Select Daybreak Coffee. View the current four-digit staff code below. It changes every three hours; do not share it.
            Its double-stamp promotion is active.
            Switch to Customer → My cards → Get Stamp. Staff approval adds 2 stamps, taking the sample card from 6 to 8.
            Then Redeem Reward with a new PIN approval. Return here to see the recorded visit and redemption.
          </Text>
        </View>
      )}
      <MerchantStaffPin key={business.id} businessId={business.id} />
      <View style={[styles.merchantHero, { backgroundColor: colors.primary }]}>
        <View style={styles.heroTop}>
          <View style={styles.heroBrand}>
            <View style={[styles.heroBrandMark, { backgroundColor: colors.accent }]}>
              <Ionicons name="cafe" size={17} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.heroBusinessName}>{business.name}</Text>
              <Text style={styles.heroCaption}>{business.location}</Text>
            </View>
          </View>
          <View style={[styles.livePill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.liveText}>{business.isDemo ? 'Demo' : business.active ? 'Live' : 'Paused'}</Text>
          </View>
        </View>
        <Text style={styles.heroMetric}>{stats.activeCampaigns}</Text>
        <Text style={styles.heroMetricCaption}>campaigns bringing customers back</Text>
        <View style={styles.heroFooter}>
          <Text style={styles.heroFooterText}>Your neighborhood is showing up.</Text>
          <Ionicons name="trending-up" size={17} color={colors.accent} />
        </View>
      </View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your loyalty at a glance</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>A pulse on your regulars</Text>
        </View>
      </View>
      <View style={styles.metricGrid}>
        {metricCards.map((metric, index) => (
          <View
            key={metric.title}
            style={[
              styles.metricCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              index === 0 && styles.metricCardFeatured,
            ]}
          >
            <View
              style={[
                styles.metricIcon,
                { backgroundColor: index === 0 ? colors.accent : colors.secondary },
              ]}
            >
              <Ionicons name={metric.icon as React.ComponentProps<typeof Ionicons>['name']} size={17} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>{metric.value}</Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{metric.title}</Text>
          </View>
        ))}
      </View>
      <MerchantActivityChart activity={stats.activity} />
      <View style={[styles.repeatCard, { backgroundColor: colors.secondary }]}>
        <View style={styles.repeatTop}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>A reason to come back</Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              {stats.repeatPercent}% of members have visited more than once
            </Text>
          </View>
          <Text style={[styles.repeatPercent, { color: colors.primary }]}>{stats.repeatPercent}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.card }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${stats.repeatPercent}%` }]} />
        </View>
      </View>
      <View style={styles.quickActions}>
        <Pressable onPress={onToggleProgram} style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={business.active ? 'pause-outline' : 'play-outline'} size={18} color={colors.primary} />
          <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>{business.active ? 'Pause loyalty program' : 'Activate loyalty program'}</Text>
        </Pressable>
        <Pressable
          testID="edit-program"
          onPress={onEditProgram}
          style={({ pressed }) => [styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="settings-outline" size={17} color={colors.primary} />
          </View>
          <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>Edit loyalty program</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          testID="manage-campaigns"
          onPress={onManage}
          style={({ pressed }) => [styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="add" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>Create campaign</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          testID="view-members"
          onPress={onMembers}
          style={({ pressed }) => [styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="people-outline" size={17} color={colors.primary} />
          </View>
          <Text style={[styles.quickActionTitle, { color: colors.foreground }]}>View members</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent loyalty members</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Your community, growing one visit at a time</Text>
        </View>
        <Pressable onPress={onMembers} hitSlop={8}>
          <Text style={[styles.linkText, { color: colors.primary }]}>See all</Text>
        </Pressable>
      </View>
      {business.members.slice(0, 3).map((member) => (
        <MemberMiniRow key={member.id} member={member} colors={colors} />
      ))}
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent reward activity</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Server-recorded stamps and redemptions</Text>
        </View>
      </View>
      {stats.recentTransactions.length === 0 ? (
        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>Approved loyalty activity will appear here.</Text>
      ) : (
        stats.recentTransactions.slice(0, 6).map((transaction) => (
          <View
            key={transaction.id}
            style={[styles.transactionRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.transactionIcon, { backgroundColor: transaction.type === 'stamp' ? colors.accent : colors.secondary }]}>
              <Ionicons
                name={transaction.type === 'stamp' ? 'add' : 'gift-outline'}
                size={16}
                color={colors.primary}
              />
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.memberName, { color: colors.foreground }]}>{transaction.memberName}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]} numberOfLines={1}>
                {transaction.description} · {new Date(transaction.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={[styles.transactionCount, { color: transaction.type === 'stamp' ? colors.primary : colors.mutedForeground }]}>
              {transaction.type === 'stamp' ? `+${transaction.stamps}` : `−${transaction.stamps}`}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function MerchantManage({
  campaigns,
  selectedFilter,
  colors,
  onFilter,
  onNew,
  onEdit,
  onDelete,
  onToggle,
}: {
  campaigns: Campaign[];
  selectedFilter: CampaignType | 'All';
  colors: ReturnType<typeof useColors>;
  onFilter: (type: CampaignType | 'All') => void;
  onNew: (type?: CampaignType) => void;
  onEdit: (campaign: Campaign) => void;
  onDelete: (campaign: Campaign) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.sectionStack}>
      <Text style={[styles.sectionIntro, { color: colors.mutedForeground }]}>
        Give your regulars another reason to come by. Every offer is yours to shape.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(['All', ...campaignTypes] as (CampaignType | 'All')[]).map((type) => {
          const selected = type === selectedFilter;
          return (
            <Pressable
              key={type}
              testID={`filter-${type.toLowerCase()}`}
              onPress={() => onFilter(type)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                {type}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {campaigns.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="A fresh start"
          detail="Create your first campaign and give customers a reason to return."
          colors={colors}
          action="Create campaign"
          onAction={() => onNew(selectedFilter === 'All' ? 'Promotion' : selectedFilter)}
        />
      ) : (
        campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            colors={colors}
            onEdit={() => onEdit(campaign)}
            onDelete={() => onDelete(campaign)}
            onToggle={() => onToggle(campaign.id)}
          />
        ))
      )}
      <Text style={[styles.helperNote, { color: colors.mutedForeground }]}>
        Promotions, rewards, tiers, events and giveaways can each be edited or paused independently.
      </Text>
    </View>
  );
}

function CampaignCard({
  campaign,
  colors,
  onEdit,
  onDelete,
  onToggle,
}: {
  campaign: Campaign;
  colors: ReturnType<typeof useColors>;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const iconMap: Record<CampaignType, React.ComponentProps<typeof Ionicons>['name']> = {
    Promotion: 'megaphone-outline',
    Reward: 'gift-outline',
    Tier: 'trophy-outline',
    Event: 'calendar-outline',
    Giveaway: 'sparkles-outline',
  };
  return (
    <View style={[styles.campaignCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.campaignTop}>
        <View style={[styles.campaignIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name={iconMap[campaign.type]} size={19} color={colors.primary} />
        </View>
        <View style={styles.flexOne}>
          <View style={styles.campaignLabelRow}>
            <Text style={[styles.campaignType, { color: colors.mutedForeground }]}>{campaign.type.toUpperCase()}</Text>
            <View style={[styles.statusPill, { backgroundColor: campaign.active ? colors.secondary : colors.muted }]}>
              <View style={[styles.statusDot, { backgroundColor: campaign.active ? colors.primary : colors.mutedForeground }]} />
              <Text style={[styles.statusText, { color: campaign.active ? colors.primary : colors.mutedForeground }]}>
                {campaign.active ? 'Active' : 'Paused'}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{campaign.title}</Text>
          <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{campaign.description}</Text>
          {campaign.type === 'Promotion' && <Text style={[styles.caption, { color: colors.primary }]}>{campaign.usageCount} approved uses</Text>}
          {(campaign.type === 'Promotion' || campaign.startAt || campaign.endAt) && (
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>
              {campaign.type === 'Promotion'
                ? campaign.multiplier > 1
                  ? `${campaign.multiplier}× stamps`
                  : campaign.bonusStamps > 0
                    ? `+${campaign.bonusStamps} bonus stamp${campaign.bonusStamps > 1 ? 's' : ''}`
                    : 'Standard stamps'
                : ''}
              {campaign.startAt ? ` · Starts ${campaign.startAt.slice(0, 10)}` : ''}
              {campaign.endAt ? ` · Ends ${campaign.endAt.slice(0, 10)}` : ''}
            </Text>
          )}
        </View>
      </View>
      <View style={[styles.campaignActions, { borderTopColor: colors.border }]}>
        <Pressable onPress={onToggle} style={styles.campaignAction} testID={`toggle-${campaign.id}`}>
          <Ionicons name={campaign.active ? 'pause-outline' : 'play-outline'} size={16} color={colors.primary} />
          <Text style={[styles.campaignActionText, { color: colors.primary }]}>{campaign.active ? 'Pause' : 'Activate'}</Text>
        </Pressable>
        <Pressable onPress={onEdit} style={styles.campaignAction} testID={`edit-${campaign.id}`}>
          <Ionicons name="create-outline" size={16} color={colors.primary} />
          <Text style={[styles.campaignActionText, { color: colors.primary }]}>Edit</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.campaignAction} testID={`delete-${campaign.id}`}>
          <Ionicons name="trash-outline" size={16} color={colors.destructive} />
          <Text style={[styles.campaignActionText, { color: colors.destructive }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MerchantMembers({
  business,
  colors,
}: {
  business: Business;
  colors: ReturnType<typeof useColors>;
}) {
  const [search, setSearch] = useState('');
  const filteredMembers = business.members.filter((member) =>
    member.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const totals = business.members.reduce(
    (result, member) => ({
      visits: result.visits + member.visits,
      redemptions: result.redemptions + member.redemptions,
    }),
    { visits: 0, redemptions: 0 },
  );
  return (
    <View style={styles.sectionStack}>
      <View style={[styles.memberSummary, { backgroundColor: colors.primary }]}>
        <View style={styles.memberSummaryItem}>
          <Text style={styles.summaryNumber}>{business.members.length}</Text>
          <Text style={styles.summaryLabel}>members</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.memberSummaryItem}>
          <Text style={styles.summaryNumber}>{totals.visits}</Text>
          <Text style={styles.summaryLabel}>total visits</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.memberSummaryItem}>
          <Text style={styles.summaryNumber}>{totals.redemptions}</Text>
          <Text style={styles.summaryLabel}>redeemed</Text>
        </View>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          testID="member-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Find a member"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Member activity</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>Customer-approved stamp and redemption history</Text>
        </View>
      </View>
      {filteredMembers.length === 0 ? (
        <EmptyState icon="search-outline" title="No member found" detail="Try another name." colors={colors} />
      ) : (
        filteredMembers.map((member) => (
          <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.memberHead}>
              <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <View style={styles.flexOne}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
                  {member.isCurrentUser && (
                    <View style={[styles.youTag, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.youTagText, { color: colors.primary }]}>YOU</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                  {member.visits} visits · {member.redemptions} rewards redeemed
                </Text>
              </View>
              <View style={styles.memberPointsCol}>
                <Text style={[styles.memberPointsLarge, { color: colors.foreground }]}>{member.points}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>points</Text>
              </View>
            </View>
            <View style={styles.memberStampRow}>
              <View style={styles.memberProgressCopy}>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                  {member.stamps}/{business.goal} stamps
                </Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                  {member.lifetimeStamps} lifetime
                </Text>
              </View>
              <View style={[styles.progressTrack, styles.memberProgressTrack, { backgroundColor: colors.background }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${Math.min((member.stamps / business.goal) * 100, 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function MemberMiniRow({ member, colors }: { member: Member; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.miniMemberRow}>
      <View style={[styles.avatar, styles.avatarSmall, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Text>
      </View>
      <View style={styles.flexOne}>
        <Text style={[styles.memberName, { color: colors.foreground }]}>{member.name}</Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>{member.visits} visits so far</Text>
      </View>
      <Text style={[styles.miniStamps, { color: colors.primary }]}>{member.stamps} stamps</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  colors,
  action,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail: string;
  colors: ReturnType<typeof useColors>;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon} size={23} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.bodyText, styles.emptyDetail, { color: colors.mutedForeground }]}>{detail}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} style={[styles.emptyAction, { backgroundColor: colors.primary }]}>
          <Text style={[styles.emptyActionText, { color: colors.primaryForeground }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function CampaignModal({
  saving,
  visible,
  title,
  description,
  type,
  active,
  error,
  editing,
  colors,
  onClose,
  onChangeTitle,
  onChangeDescription,
  onChangeType,
  onToggleActive,
  startDate,
  endDate,
  promotionBoost,
  onChangeStartDate,
  onChangeEndDate,
  onChangePromotionBoost,
  onSubmit,
}: {
  saving: boolean;
  visible: boolean;
  title: string;
  description: string;
  type: CampaignType;
  active: boolean;
  error: string;
  editing: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeType: (value: CampaignType) => void;
  onToggleActive: () => void;
  startDate: string;
  endDate: string;
  promotionBoost: 'standard' | 'double' | 'bonus';
  onChangeStartDate: (value: string) => void;
  onChangeEndDate: (value: string) => void;
  onChangePromotionBoost: (value: 'standard' | 'double' | 'bonus') => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 20 : 0 }]}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalIconButton} accessibilityLabel="Close campaign editor">
            <Ionicons name="close" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {editing ? 'Edit campaign' : 'Create a campaign'}
          </Text>
          <View style={styles.modalIconButton} />
        </View>
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.formLabel, { color: colors.foreground }]}>CAMPAIGN TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {campaignTypes.map((item) => {
              const selected = item === type;
              return (
                <Pressable
                  key={item}
                  testID={`form-type-${item.toLowerCase()}`}
                  onPress={() => onChangeType(item)}
                  style={[styles.filterChip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}
                >
                  <Text style={[styles.filterText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.formLabel, { color: colors.foreground }]}>NAME</Text>
          <TextInput
            testID="campaign-title"
            value={title}
            onChangeText={onChangeTitle}
            placeholder="e.g. Your afternoon, on us"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.formInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            maxLength={60}
            returnKeyType="next"
          />
          <Text style={[styles.formLabel, { color: colors.foreground }]}>CUSTOMER DESCRIPTION</Text>
          <TextInput
            testID="campaign-description"
            value={description}
            onChangeText={onChangeDescription}
            placeholder="A few words about the offer and how it works"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.formInput, styles.formMultiline, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            multiline
            maxLength={180}
            textAlignVertical="top"
          />
          {type === 'Promotion' && (
            <View style={styles.promotionEditor}>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>PROMOTION WINDOW</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                Leave either date blank for an open-ended schedule. A visit can use only one active stamp promotion.
              </Text>
              <View style={styles.promotionDateRow}>
                <TextInput
                  testID="campaign-start-date"
                  value={startDate}
                  onChangeText={onChangeStartDate}
                  placeholder="Start · YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.formInput, styles.promotionDateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  maxLength={10}
                  autoCapitalize="none"
                />
                <TextInput
                  testID="campaign-end-date"
                  value={endDate}
                  onChangeText={onChangeEndDate}
                  placeholder="End · YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.formInput, styles.promotionDateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  maxLength={10}
                  autoCapitalize="none"
                />
              </View>
              <Text style={[styles.formLabel, { color: colors.foreground }]}>STAMP BOOST</Text>
              <View style={styles.promotionBoostRow}>
                {([
                  ['standard', 'Standard'],
                  ['double', 'Double stamps'],
                  ['bonus', '+1 bonus stamp'],
                ] as const).map(([value, label]) => {
                  const selected = promotionBoost === value;
                  return (
                    <Pressable
                      key={value}
                      testID={`promotion-boost-${value}`}
                      onPress={() => onChangePromotionBoost(value)}
                      style={[
                        styles.promotionBoost,
                        {
                          backgroundColor: selected ? colors.primary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.promotionBoostText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Pressable
            testID="campaign-status"
            onPress={onToggleActive}
            style={[styles.statusToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.statusToggleIcon, { backgroundColor: active ? colors.accent : colors.muted }]}>
              <Ionicons name={active ? 'checkmark-circle' : 'pause-circle-outline'} size={20} color={active ? colors.primary : colors.mutedForeground} />
            </View>
            <View style={styles.flexOne}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{active ? 'Active for customers' : 'Paused'}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {active ? 'Customers can see this campaign.' : 'Customers will not see this yet.'}
              </Text>
            </View>
            <Ionicons name={active ? 'toggle' : 'toggle-outline'} size={28} color={active ? colors.primary : colors.mutedForeground} />
          </Pressable>
          {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}
          <Pressable
            testID="save-campaign"
            disabled={saving}
            onPress={onSubmit}
            style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.saveButtonText, { color: colors.primaryForeground }]}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create campaign'}
            </Text>
            <Ionicons name="arrow-forward" size={17} color={colors.primaryForeground} />
          </Pressable>
          <Text style={[styles.formFootnote, { color: colors.mutedForeground }]}>
            You can change or pause this campaign at any time.
          </Text>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cardActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  demoPill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  demoPillText: { fontSize: 8, letterSpacing: 0.7, fontFamily: 'Inter_700Bold' },
  joinButton: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  joinButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  transactionRow: { minHeight: 58, borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  transactionIcon: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  transactionCount: { minWidth: 32, textAlign: 'right', fontSize: 12, fontFamily: 'Inter_700Bold' },
  promotionEditor: { gap: 8, paddingVertical: 12 },
  promotionDateRow: { flexDirection: 'row', gap: 8 },
  promotionDateInput: { flex: 1, minWidth: 0, paddingHorizontal: 9, fontSize: 11 },
  promotionBoostRow: { flexDirection: 'row', gap: 6 },
  promotionBoost: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  promotionBoostText: { fontSize: 10, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingMark: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  retryButton: { minHeight: 43, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  topBar: { height: 54, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: '#D45B4D', borderWidth: 1, borderColor: '#FFFFFF' },
  roleChip: { height: 37, paddingHorizontal: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 15, paddingBottom: 34, gap: 8 },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.8, marginBottom: 6 },
  headingRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  pageTitle: { fontSize: 27, lineHeight: 33, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  businessPicker: { gap: 8, paddingBottom: 9 },
  businessChip: { minHeight: 32, maxWidth: 180, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  businessChipText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  emptyMerchant: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 12, alignItems: 'flex-start' },
  emptyMerchantIcon: { width: 49, height: 49, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  emptyMerchantTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'Inter_700Bold' },
  emptyMerchantText: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  primaryWideButton: { width: '100%', minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryWideButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  secondaryWideButton: { width: '100%', minHeight: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryWideButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  addButton: { height: 37, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 3 },
  addButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  sectionStack: { gap: 14 },
  sectionIntro: { fontSize: 14, lineHeight: 21, marginBottom: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 0 },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.35 },
  sectionSubtitle: { fontSize: 11, lineHeight: 17, marginTop: 3, fontFamily: 'Inter_400Regular' },
  linkText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  flexOne: { flex: 1 },
  pointsCard: { minHeight: 178, borderRadius: 25, padding: 21, overflow: 'hidden', justifyContent: 'space-between' },
  pointsTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pointsEyebrow: { color: 'rgba(255,255,255,0.69)', fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4 },
  pointsNumber: { color: '#FFFFFF', fontSize: 39, lineHeight: 47, fontFamily: 'Inter_700Bold', letterSpacing: -1.2, marginTop: 7 },
  pointsIcon: { width: 41, height: 41, borderRadius: 15, backgroundColor: '#E8EF61', alignItems: 'center', justifyContent: 'center' },
  pointsDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.16)', marginVertical: 11 },
  pointsBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pointsFootnote: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontFamily: 'Inter_400Regular' },
  pointsLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pointsLinkText: { color: '#E8EF61', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  orb: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 100 },
  orbOne: { width: 140, height: 140, right: -68, top: 10 },
  orbTwo: { width: 92, height: 92, right: -44, top: 34 },
  readyBanner: { minHeight: 71, borderRadius: 19, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  readyIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.48)', alignItems: 'center', justifyContent: 'center' },
  readyTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  readyBody: { fontSize: 11, marginTop: 3, fontFamily: 'Inter_500Medium' },
  nudgeBanner: { minHeight: 70, borderRadius: 19, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  nudgeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stampCard: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 14 },
  stampCardCompact: { padding: 14, gap: 11 },
  storeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  storeMark: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.2 },
  caption: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  stampCount: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  stampCountText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stampDot: { width: 30, height: 30, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E6E9DF', paddingTop: 12, gap: 10 },
  rewardName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 17 },
  redeemButton: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 11 },
  redeemText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  outlineAction: { minHeight: 51, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  storeCard: { padding: 15, borderWidth: 1, borderRadius: 21, gap: 12 },
  favoriteButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  storeDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailSpacer: { flex: 1 },
  offerLine: { minHeight: 37, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  offerText: { flex: 1, fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  memberPoints: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  noticeCard: { borderRadius: 18, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  unreadMark: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D45B4D' },
  merchantHero: { minHeight: 209, borderRadius: 25, padding: 20, overflow: 'hidden', justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroBrandMark: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroBusinessName: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter_700Bold' },
  heroCaption: { color: 'rgba(255,255,255,0.62)', fontSize: 10, marginTop: 3, fontFamily: 'Inter_400Regular' },
  livePill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveText: { color: '#FFFFFF', fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  heroMetric: { color: '#FFFFFF', fontSize: 38, lineHeight: 44, fontFamily: 'Inter_700Bold', letterSpacing: -1.4, marginTop: 14 },
  heroMetricCaption: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontFamily: 'Inter_400Regular' },
  heroFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 11, marginTop: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroFooterText: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontFamily: 'Inter_500Medium' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { width: '48%', flexGrow: 1, minHeight: 115, borderWidth: 1, borderRadius: 18, padding: 13, justifyContent: 'space-between' },
  metricCardFeatured: { borderColor: 'transparent' },
  metricIcon: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 8 },
  metricLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  repeatCard: { borderRadius: 18, padding: 15, gap: 13 },
  repeatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  repeatPercent: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  progressTrack: { height: 7, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  quickActions: { gap: 9 },
  quickAction: { minHeight: 55, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  quickActionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  quickActionTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  miniMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  avatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarSmall: { width: 34, height: 34, borderRadius: 12 },
  avatarText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  memberName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  miniStamps: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  filterRow: { flexDirection: 'row', gap: 7, paddingRight: 12 },
  filterChip: { minHeight: 33, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  campaignCard: { borderRadius: 19, borderWidth: 1, padding: 13, gap: 11 },
  campaignTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  campaignIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  campaignLabelRow: { minHeight: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginBottom: 2 },
  campaignType: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  statusPill: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 8, fontFamily: 'Inter_600SemiBold' },
  bodyText: { fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 3 },
  campaignActions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  campaignAction: { minHeight: 30, minWidth: 69, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  campaignActionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  helperNote: { fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: 12, marginTop: 4 },
  memberSummary: { minHeight: 89, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 10 },
  memberSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryNumber: { fontSize: 21, color: '#FFFFFF', fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_500Medium' },
  summaryDivider: { width: 1, height: 31, backgroundColor: 'rgba(255,255,255,0.17)' },
  searchBox: { height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, height: '100%', fontSize: 12, fontFamily: 'Inter_400Regular', outlineStyle: 'none' as never },
  memberCard: { borderWidth: 1, borderRadius: 19, padding: 13, gap: 11 },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youTag: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  youTagText: { fontSize: 7, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  memberPointsCol: { alignItems: 'flex-end' },
  memberPointsLarge: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  memberStampRow: { gap: 6 },
  memberProgressCopy: { flexDirection: 'row', justifyContent: 'space-between' },
  memberProgressTrack: { height: 5 },
  memberActions: { flexDirection: 'row', gap: 8 },
  memberPrimaryAction: { flex: 1, height: 37, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  memberPrimaryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  memberSecondaryAction: { width: 94, height: 37, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  memberSecondaryText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  emptyState: { minHeight: 205, borderRadius: 21, borderWidth: 1, padding: 22, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptyDetail: { maxWidth: 250, textAlign: 'center', marginTop: 0 },
  emptyAction: { marginTop: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11 },
  emptyActionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  bottomNav: { minHeight: 60, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  navItem: { minWidth: 72, minHeight: 45, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' },
  navLabel: { fontSize: 9, fontFamily: 'Inter_500Medium' },
  navLabelActive: { fontFamily: 'Inter_700Bold' },
  navDot: { position: 'absolute', top: -5, width: 17, height: 2, borderRadius: 2 },
  modalRoot: { flex: 1 },
  modalHeader: { height: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalIconButton: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  modalContent: { paddingHorizontal: 22, paddingTop: 15, paddingBottom: 40, gap: 11 },
  formLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginTop: 5 },
  formInput: { minHeight: 47, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 13, fontFamily: 'Inter_400Regular' },
  formMultiline: { minHeight: 99, paddingTop: 13, paddingBottom: 13 },
  statusToggle: { minHeight: 61, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  statusToggleIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  saveButton: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 7 },
  saveButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  formFootnote: { fontSize: 10, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 4 },
});
