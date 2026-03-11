import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService, type UserListParams } from '@/services/user.service';
import { showSuccess, showError } from '@/lib/toast';

export function useUserList(params: UserListParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => userService.getList(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserDetail(id: string | null) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => (id ? userService.getById(id) : Promise.reject(new Error('No id'))),
    enabled: !!id,
  });
}

export function useUserUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof userService.update>[1] }) =>
      userService.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess('회원 정보가 수정되었습니다.');
    },
    onError: () => showError('회원 정보 수정에 실패했습니다.'),
  });
}

const STATUS_LABELS: Record<string, string> = {
  active: '활성화',
  inactive: '비활성',
  suspended: '정지',
  terminated: '해지',
};

export function useUserStatusUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' | 'terminated' }) =>
      userService.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess(`상태가 '${STATUS_LABELS[status] ?? status}'로 변경되었습니다.`);
    },
    onError: () => showError('상태 변경에 실패했습니다.'),
  });
}

export function useUserSuspend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => userService.suspend(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess('계정이 정지되었습니다.');
    },
    onError: () => showError('계정 정지에 실패했습니다.'),
  });
}

export function useUserDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => userService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess('회원이 삭제되었습니다.');
    },
    onError: () => showError('회원 삭제에 실패했습니다.'),
  });
}
