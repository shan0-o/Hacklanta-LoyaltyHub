import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type CampaignType =
  | 'Promotion'
  | 'Reward'
  | 'Tier'
  | 'Event'
  | 'Giveaway';

export type Campaign = {
  id: string;
  type: CampaignType;
  title: string;
  description: string;
  active: boolean;
};

export type Member = {
  id: string;
  name: string;
  stamps: number;
  points: number;
  visits: number;
  redemptions: number;
  lifetimeStamps: number;
  isCurrentUser?: boolean;
};

export type Business = {
  id: string;
  name: string;
  category: string;
  location: string;
  goal: number;
  members: Member[];
  campaigns: Campaign[];
};

export type RewardNotice = {
  id: string;
  businessId: string;
  message: string;
  createdAt: string;
  read: boolean;
};

type LoyaltyData = {
  businesses: Business[];
  favorites: string[];
  notices: RewardNotice[];
};

type LoyaltyContextValue = LoyaltyData & {
  ready: boolean;
  toggleFavorite: (businessId: string) => void;
  saveCampaign: (
    businessId: string,
    campaign: Omit<Campaign, 'id'> & { id?: string },
  ) => void;
  deleteCampaign: (businessId: string, campaignId: string) => void;
  toggleCampaign: (businessId: string, campaignId: string) => void;
  addStamp: (businessId: string, memberId: string) => boolean;
  redeemReward: (businessId: string, memberId: string) => boolean;
  markNoticeRead: (noticeId: string) => void;
};

const STORAGE_KEY = 'loyalty-loop-v1';
const currentTime = new Date().toISOString();

const initialData: LoyaltyData = {
  favorites: ['daybreak'],
  notices: [],
  businesses: [
    {
      id: 'daybreak',
      name: 'Daybreak Coffee',
      category: 'Coffee & bakery',
      location: 'West Village · 0.4 mi',
      goal: 8,
      members: [
        {
          id: 'maya-daybreak',
          name: 'Maya Chen',
          stamps: 6,
          points: 420,
          visits: 12,
          redemptions: 3,
          lifetimeStamps: 36,
          isCurrentUser: true,
        },
        {
          id: 'jordan-daybreak',
          name: 'Jordan Lee',
          stamps: 4,
          points: 260,
          visits: 8,
          redemptions: 2,
          lifetimeStamps: 24,
        },
        {
          id: 'sasha-daybreak',
          name: 'Sasha Patel',
          stamps: 7,
          points: 510,
          visits: 19,
          redemptions: 5,
          lifetimeStamps: 72,
        },
        {
          id: 'ben-daybreak',
          name: 'Ben Carter',
          stamps: 2,
          points: 90,
          visits: 3,
          redemptions: 0,
          lifetimeStamps: 12,
        },
      ],
      campaigns: [
        {
          id: 'campaign-morning',
          type: 'Promotion',
          title: 'Your morning, on us',
          description: 'Buy any two pastries before 10am and your coffee is on us.',
          active: true,
        },
        {
          id: 'campaign-free-coffee',
          type: 'Reward',
          title: 'A coffee on us',
          description: 'Collect 8 stamps and choose any drink from the menu.',
          active: true,
        },
        {
          id: 'campaign-regular',
          type: 'Tier',
          title: 'The Regulars Club',
          description: 'Visit 12 times in a month to unlock a monthly tasting.',
          active: true,
        },
        {
          id: 'campaign-latte-art',
          type: 'Event',
          title: 'Latte art, up close',
          description: 'Saturday · 11am · A free morning with our head barista.',
          active: true,
        },
        {
          id: 'campaign-beans',
          type: 'Giveaway',
          title: 'A month of good mornings',
          description: 'Enter to win four bags of our seasonal house beans.',
          active: false,
        },
      ],
    },
    {
      id: 'lark',
      name: 'Lark & Loaf',
      category: 'Neighborhood bakery',
      location: 'Chelsea · 0.8 mi',
      goal: 8,
      members: [
        {
          id: 'maya-lark',
          name: 'Maya Chen',
          stamps: 3,
          points: 120,
          visits: 5,
          redemptions: 1,
          lifetimeStamps: 16,
          isCurrentUser: true,
        },
      ],
      campaigns: [
        {
          id: 'lark-reward',
          type: 'Reward',
          title: 'Your next loaf is free',
          description: 'One stamp with every loaf. Eight stamps unlock your favorite.',
          active: true,
        },
        {
          id: 'lark-event',
          type: 'Event',
          title: 'Sunday sourdough club',
          description: 'Join us for a warm loaf and a behind-the-scenes bake.',
          active: true,
        },
        {
          id: 'lark-giveaway',
          type: 'Giveaway',
          title: 'The baker’s dozen',
          description: 'Win a box of thirteen fresh-baked favorites.',
          active: true,
        },
      ],
    },
  ],
};

const LoyaltyContext = createContext<LoyaltyContextValue | null>(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LoyaltyData>(initialData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!mounted) return;
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as LoyaltyData;
            if (Array.isArray(parsed.businesses)) setData(parsed);
          } catch {
            setData(initialData);
          }
        }
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, ready]);

  const update = useCallback((transform: (current: LoyaltyData) => LoyaltyData) => {
    setData((current) => transform(current));
  }, []);

  const toggleFavorite = useCallback(
    (businessId: string) => {
      update((current) => ({
        ...current,
        favorites: current.favorites.includes(businessId)
          ? current.favorites.filter((id) => id !== businessId)
          : [...current.favorites, businessId],
      }));
    },
    [update],
  );

  const saveCampaign = useCallback(
    (businessId: string, campaign: Omit<Campaign, 'id'> & { id?: string }) => {
      update((current) => ({
        ...current,
        businesses: current.businesses.map((business) => {
          if (business.id !== businessId) return business;
          const saved: Campaign = {
            id: campaign.id ?? makeId(),
            type: campaign.type,
            title: campaign.title.trim(),
            description: campaign.description.trim(),
            active: campaign.active,
          };
          const exists = business.campaigns.some((item) => item.id === saved.id);
          return {
            ...business,
            campaigns: exists
              ? business.campaigns.map((item) => (item.id === saved.id ? saved : item))
              : [saved, ...business.campaigns],
          };
        }),
      }));
    },
    [update],
  );

  const deleteCampaign = useCallback(
    (businessId: string, campaignId: string) => {
      update((current) => ({
        ...current,
        businesses: current.businesses.map((business) =>
          business.id === businessId
            ? {
                ...business,
                campaigns: business.campaigns.filter((item) => item.id !== campaignId),
              }
            : business,
        ),
      }));
    },
    [update],
  );

  const toggleCampaign = useCallback(
    (businessId: string, campaignId: string) => {
      update((current) => ({
        ...current,
        businesses: current.businesses.map((business) =>
          business.id === businessId
            ? {
                ...business,
                campaigns: business.campaigns.map((item) =>
                  item.id === campaignId ? { ...item, active: !item.active } : item,
                ),
              }
            : business,
        ),
      }));
    },
    [update],
  );

  const addStamp = useCallback(
    (businessId: string, memberId: string) => {
      let reachedReward = false;
      update((current) => {
        const business = current.businesses.find((item) => item.id === businessId);
        const member = business?.members.find((item) => item.id === memberId);
        if (!business || !member || member.stamps >= business.goal) return current;
        const nextStamps = member.stamps + 1;
        reachedReward = nextStamps === business.goal;
        const updatedBusiness: Business = {
          ...business,
          members: business.members.map((item) =>
            item.id === memberId
              ? {
                  ...item,
                  stamps: nextStamps,
                  points: item.points + 10,
                  visits: item.visits + 1,
                  lifetimeStamps: item.lifetimeStamps + 1,
                }
              : item,
          ),
        };
        const notices = reachedReward
          ? [
              {
                id: makeId(),
                businessId,
                message: `Your reward at ${business.name} is ready to redeem.`,
                createdAt: currentTime,
                read: false,
              },
              ...current.notices,
            ]
          : current.notices;
        return {
          ...current,
          businesses: current.businesses.map((item) =>
            item.id === businessId ? updatedBusiness : item,
          ),
          notices,
        };
      });
      return reachedReward;
    },
    [update],
  );

  const redeemReward = useCallback(
    (businessId: string, memberId: string) => {
      let redeemed = false;
      update((current) => {
        const business = current.businesses.find((item) => item.id === businessId);
        const member = business?.members.find((item) => item.id === memberId);
        if (!business || !member || member.stamps < business.goal) return current;
        redeemed = true;
        return {
          ...current,
          businesses: current.businesses.map((item) =>
            item.id === businessId
              ? {
                  ...item,
                  members: item.members.map((person) =>
                    person.id === memberId
                      ? {
                          ...person,
                          stamps: 0,
                          redemptions: person.redemptions + 1,
                        }
                      : person,
                  ),
                }
              : item,
          ),
        };
      });
      return redeemed;
    },
    [update],
  );

  const markNoticeRead = useCallback(
    (noticeId: string) => {
      update((current) => ({
        ...current,
        notices: current.notices.map((notice) =>
          notice.id === noticeId ? { ...notice, read: true } : notice,
        ),
      }));
    },
    [update],
  );

  const value = useMemo(
    () => ({
      ...data,
      ready,
      toggleFavorite,
      saveCampaign,
      deleteCampaign,
      toggleCampaign,
      addStamp,
      redeemReward,
      markNoticeRead,
    }),
    [
      data,
      ready,
      toggleFavorite,
      saveCampaign,
      deleteCampaign,
      toggleCampaign,
      addStamp,
      redeemReward,
      markNoticeRead,
    ],
  );

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>;
}

export function useLoyalty() {
  const context = useContext(LoyaltyContext);
  if (!context) throw new Error('useLoyalty must be used inside LoyaltyProvider');
  return context;
}
