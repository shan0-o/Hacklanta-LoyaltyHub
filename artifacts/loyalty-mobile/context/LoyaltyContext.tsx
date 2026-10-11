import {
  getGetLoyaltySnapshotQueryKey,
  useCreateBusiness,
  useCreateCampaign,
  useDeleteCampaign,
  useGetLoyaltySnapshot,
  useJoinBusiness,
  useMarkNoticeRead,
  useRedeemReward,
  useRequestStamp,
  useSeedDemoBusinesses,
  useToggleFavorite,
  useUpdateBusiness,
  useUpdateCampaign,
} from "@workspace/api-client-react";
import type {
  Business as ApiBusiness,
  BusinessInput,
  BusinessUpdate,
  Campaign as ApiCampaign,
  CampaignInput,
  DemoSeedResult,
  LoyaltySnapshot,
  Member as ApiMember,
  Notice,
  RedemptionResult,
  StampResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { createContext, ReactNode, useCallback, useContext } from "react";

export type CampaignType = ApiCampaign["type"];
export type Campaign = ApiCampaign;
export type Member = ApiMember;
export type Business = ApiBusiness;
export type RewardNotice = Notice;

export type CampaignDraft = Pick<
  Campaign,
  "type" | "title" | "description" | "active"
> &
  Partial<Pick<Campaign, "startAt" | "endAt" | "multiplier" | "bonusStamps">> & {
    id?: string;
  };

type LoyaltyContextValue = LoyaltySnapshot & {
  ready: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  seedDemo: (displayName: string) => Promise<DemoSeedResult>;
  createBusiness: (input: BusinessInput) => Promise<Business>;
  updateBusiness: (
    businessId: string,
    input: BusinessUpdate,
  ) => Promise<Business>;
  joinBusiness: (businessId: string, displayName: string) => Promise<Business>;
  toggleFavorite: (businessId: string) => Promise<void>;
  saveCampaign: (businessId: string, campaign: CampaignDraft) => Promise<void>;
  deleteCampaign: (businessId: string, campaignId: string) => Promise<void>;
  toggleCampaign: (businessId: string, campaignId: string) => Promise<void>;
  requestStamp: (
    businessId: string,
    staffPin: string,
    idempotencyKey: string,
  ) => Promise<StampResult>;
  redeemReward: (
    businessId: string,
    staffPin: string,
    idempotencyKey: string,
  ) => Promise<RedemptionResult>;
  markNoticeRead: (noticeId: string) => Promise<void>;
};

const emptySnapshot: LoyaltySnapshot = {
  businesses: [],
  favorites: [],
  notices: [],
};

const LoyaltyContext = createContext<LoyaltyContextValue | null>(null);

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function LoyaltyProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const snapshotKey = [...getGetLoyaltySnapshotQueryKey(), userId];
  const snapshotQuery = useGetLoyaltySnapshot({
    query: {
      queryKey: snapshotKey,
      enabled: Boolean(userId),
      staleTime: 15_000,
    },
  });
  const invalidateSnapshot = useCallback(
    () => queryClient.invalidateQueries({ queryKey: snapshotKey }),
    [queryClient, userId],
  );

  const seedDemoMutation = useSeedDemoBusinesses({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const createBusinessMutation = useCreateBusiness({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const updateBusinessMutation = useUpdateBusiness({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const createCampaignMutation = useCreateCampaign({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const updateCampaignMutation = useUpdateCampaign({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const deleteCampaignMutation = useDeleteCampaign({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const joinBusinessMutation = useJoinBusiness({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const favoriteMutation = useToggleFavorite({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const stampMutation = useRequestStamp({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const redemptionMutation = useRedeemReward({
    mutation: { onSuccess: invalidateSnapshot },
  });
  const noticeMutation = useMarkNoticeRead({
    mutation: { onSuccess: invalidateSnapshot },
  });

  const snapshot = snapshotQuery.data ?? emptySnapshot;

  const refresh = useCallback(async () => {
    await snapshotQuery.refetch();
  }, [snapshotQuery]);

  const seedDemo = useCallback(
    async (displayName: string) =>
      seedDemoMutation.mutateAsync({ data: { displayName } }),
    [seedDemoMutation],
  );
  const createBusiness = useCallback(
    async (input: BusinessInput) =>
      createBusinessMutation.mutateAsync({ data: input }),
    [createBusinessMutation],
  );
  const updateBusiness = useCallback(
    async (businessId: string, input: BusinessUpdate) =>
      updateBusinessMutation.mutateAsync({ businessId, data: input }),
    [updateBusinessMutation],
  );
  const joinBusiness = useCallback(
    async (businessId: string, displayName: string) =>
      joinBusinessMutation.mutateAsync({
        businessId,
        data: { displayName },
      }),
    [joinBusinessMutation],
  );
  const toggleFavorite = useCallback(
    async (businessId: string) =>
      favoriteMutation.mutateAsync({
        businessId,
        data: {
          favorite: !snapshot.favorites.includes(businessId),
        },
      }).then(() => undefined),
    [favoriteMutation, snapshot.favorites],
  );
  const saveCampaign = useCallback(
    async (businessId: string, campaign: CampaignDraft) => {
      const input: CampaignInput = {
        type: campaign.type,
        title: campaign.title,
        description: campaign.description,
        active: campaign.active,
        startAt: campaign.startAt ?? null,
        endAt: campaign.endAt ?? null,
        multiplier: campaign.multiplier ?? 1,
        bonusStamps: campaign.bonusStamps ?? 0,
      };
      if (campaign.id) {
        await updateCampaignMutation.mutateAsync({
          campaignId: campaign.id,
          data: input,
        });
      } else {
        await createCampaignMutation.mutateAsync({
          businessId,
          data: input,
        });
      }
    },
    [createCampaignMutation, updateCampaignMutation],
  );
  const deleteCampaign = useCallback(
    async (_businessId: string, campaignId: string) => {
      await deleteCampaignMutation.mutateAsync({ campaignId });
    },
    [deleteCampaignMutation],
  );
  const toggleCampaign = useCallback(
    async (businessId: string, campaignId: string) => {
      const business = snapshot.businesses.find((item) => item.id === businessId);
      const campaign = business?.campaigns.find((item) => item.id === campaignId);
      if (!campaign) throw new Error("Campaign not found.");
      await updateCampaignMutation.mutateAsync({
        campaignId,
        data: {
          type: campaign.type,
          title: campaign.title,
          description: campaign.description,
          active: !campaign.active,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
          multiplier: campaign.multiplier,
          bonusStamps: campaign.bonusStamps,
        },
      });
    },
    [snapshot.businesses, updateCampaignMutation],
  );
  const requestStamp = useCallback(
    async (businessId: string, staffPin: string, idempotencyKey: string) =>
      stampMutation.mutateAsync({
        businessId,
        data: { staffPin, idempotencyKey },
      }),
    [stampMutation],
  );
  const redeemReward = useCallback(
    async (businessId: string, staffPin: string, idempotencyKey: string) =>
      redemptionMutation.mutateAsync({
        businessId,
        data: { staffPin, idempotencyKey },
      }),
    [redemptionMutation],
  );
  const markNoticeRead = useCallback(
    async (noticeId: string) => {
      await noticeMutation.mutateAsync({ noticeId });
    },
    [noticeMutation],
  );

  const value: LoyaltyContextValue = {
    ...snapshot,
    ready: snapshotQuery.isSuccess,
    loading: snapshotQuery.isLoading,
    error: snapshotQuery.isError ? readableError(snapshotQuery.error) : null,
    refresh,
    seedDemo,
    createBusiness,
    updateBusiness,
    joinBusiness,
    toggleFavorite,
    saveCampaign,
    deleteCampaign,
    toggleCampaign,
    requestStamp,
    redeemReward,
    markNoticeRead,
  };

  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>;
}

export function useLoyalty() {
  const context = useContext(LoyaltyContext);
  if (!context) throw new Error("useLoyalty must be used inside LoyaltyProvider.");
  return context;
}

export function getLoyaltyErrorMessage(error: unknown) {
  return readableError(error);
}
