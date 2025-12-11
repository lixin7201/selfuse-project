import { getTranslations, setRequestLocale } from 'next-intl/server';

import {
  PERMISSIONS,
  requireAllPermissions,
} from '@/core/rbac';
import { Empty } from '@/shared/blocks/common';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import { getUserCreditsSummary, setUserCredits } from '@/shared/models/credit';
import { findUserById, updateUser } from '@/shared/models/user';
import { Crumb } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';

export default async function UserEditCreditsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Check if user has permission to edit credits
  await requireAllPermissions({
    codes: [PERMISSIONS.USERS_WRITE, PERMISSIONS.CREDITS_WRITE],
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const user = await findUserById(id);
  if (!user) {
    return <Empty message="User not found" />;
  }

  const creditsSummary = await getUserCreditsSummary(user.id);

  const t = await getTranslations('admin.users');

  const crumbs: Crumb[] = [
    { title: t('edit_credits.crumbs.admin'), url: '/admin' },
    { title: t('edit_credits.crumbs.users'), url: '/admin/users' },
    { title: t('edit_credits.crumbs.edit_credits'), is_active: true },
  ];

  const form: Form = {
    fields: [
      {
        name: 'email',
        type: 'text',
        title: t('fields.email'),
        validation: { required: true },
        attributes: { disabled: true },
      },
      {
        name: 'unlimitedCredits',
        type: 'switch',
        title: t('fields.unlimited_credits'),
        tip: t('fields.unlimited_credits_desc'),
      },
      {
        name: 'targetCredits',
        type: 'number',
        title: t('fields.target_credits'),
        tip: t('fields.target_credits_desc'),
        attributes: {},
      },
      {
        name: 'expiresAt',
        type: 'text',
        title: t('fields.expires_at'),
        tip: t('fields.expires_at_desc'),
        attributes: { type: 'date' },
      },
      {
        name: 'note',
        type: 'textarea',
        title: t('fields.note'),
      },
    ],
    passby: {
      user,
    },
    data: {
      email: user.email,
      unlimitedCredits: creditsSummary.isUnlimited,
      targetCredits: creditsSummary.remainingCredits,
      expiresAt: creditsSummary.expiresAt ? new Date(creditsSummary.expiresAt).toISOString().split('T')[0] : '',
    },
    submit: {
      button: {
        title: t('edit_credits.buttons.submit'),
      },
      handler: async (data, passby) => {
        'use server';

        const { user } = passby;

        if (!user) {
          throw new Error('no auth');
        }

        const unlimitedCredits = data.get('unlimitedCredits') === 'true' || data.get('unlimitedCredits') === 'on';
        const targetCredits = parseInt(data.get('targetCredits') as string) || 0;
        const expiresAtStr = data.get('expiresAt') as string;
        const note = data.get('note') as string;

        const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null;

        if (unlimitedCredits) {
            // Set unlimited
            await updateUser(user.id, { unlimitedCredits: true });
            // Optional: clear balance to 0 for cleanliness
            // await setUserCredits({ userId: user.id, targetCredits: 0, scene: 'admin_adjust' });
        } else {
            // Unset unlimited
            await updateUser(user.id, { unlimitedCredits: false });
            // Set balance
            await setUserCredits({
                userId: user.id,
                targetCredits,
                expiresAt,
                scene: 'admin_adjust',
                note,
            });
        }

        return {
          status: 'success',
          message: 'credits updated',
          redirect_url: '/admin/users',
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t('edit_credits.title')} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
