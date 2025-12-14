import { NextResponse } from 'next/server';

import { ChatStatus, findChatById, updateChat } from '@/shared/models/chat';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const { chatId }: { chatId: string } = await req.json();

    if (!chatId) {
      return NextResponse.json(
        { code: 400, message: 'chatId is required' },
        { status: 400 }
      );
    }

    // check user sign
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { code: 401, message: 'no auth, please sign in' },
        { status: 401 }
      );
    }

    // check chat exists
    const chat = await findChatById(chatId);
    if (!chat) {
      return NextResponse.json(
        { code: 404, message: 'chat not found' },
        { status: 404 }
      );
    }

    // check permission
    if (chat.userId !== user.id) {
      return NextResponse.json(
        { code: 403, message: 'no permission to delete this chat' },
        { status: 403 }
      );
    }

    // soft delete chat by updating status
    await updateChat(chatId, {
      status: ChatStatus.DELETED,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      code: 0,
      message: 'chat deleted successfully',
    });
  } catch (e: any) {
    console.error('delete chat failed:', e);
    return NextResponse.json(
      { code: 500, message: e.message || 'delete chat failed' },
      { status: 500 }
    );
  }
}
