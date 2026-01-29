'use client';

import { useCallback, useState } from 'react';

export interface DestructiveActionState<T> {
  dialogOpen: boolean;
  dialogTitle: string;
  dialogDescription: string;
  confirmationToken: string | null;
  /** Optional context (e.g. company, newStatus) for the second request */
  context: T | null;
}

/**
 * PHASE-2: Hook for two-step destructive actions.
 * 1) Call the API; if it returns requires_confirmation + confirmation_token, open dialog and store token.
 * 2) On confirm, call executeWithToken(confirmation_token) so the caller can re-call the API with the token.
 */
export function useDestructiveAction<T = unknown>() {
  const [state, setState] = useState<DestructiveActionState<T>>({
    dialogOpen: false,
    dialogTitle: '',
    dialogDescription: '',
    confirmationToken: null,
    context: null,
  });

  const requestConfirmation = useCallback(
    (params: {
      title: string;
      description: string;
      confirmationToken: string;
      context?: T | null;
    }) => {
      setState({
        dialogOpen: true,
        dialogTitle: params.title,
        dialogDescription: params.description,
        confirmationToken: params.confirmationToken,
        context: params.context ?? null,
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    setState({
      dialogOpen: false,
      dialogTitle: '',
      dialogDescription: '',
      confirmationToken: null,
      context: null,
    });
  }, []);

  const consumeToken = useCallback((): { token: string; context: T | null } => {
    const token = state.confirmationToken;
    const context = state.context;
    closeDialog();
    return { token: token ?? '', context };
  }, [state.confirmationToken, state.context, closeDialog]);

  return {
    ...state,
    requestConfirmation,
    closeDialog,
    consumeToken,
    hasPendingConfirmation: state.dialogOpen && !!state.confirmationToken,
    pendingContext: state.context,
  };
}
