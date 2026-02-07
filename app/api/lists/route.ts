import { NextResponse, NextRequest } from 'next/server';
import { createUser, getUserByEmail, getDb } from '@/lib/db';
import { auth } from '@/auth';

const defaultLists = ['Watched', 'Watching', 'To Watch', 'Favorites'];

async function resolveUserId(session) {
  let userId = session.user.id;
  const user = await getUserByEmail(session.user.email);

  if (user) {
    userId = user.id;
  } else {
    // Self-healing: Create user if missing
    await createUser({
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image
    });
    const db = await getDb();
    await db.collection('lists').insertMany(
        defaultLists.map(name => ({ 
            user_id: session.user.id, 
            name, 
            created_at: new Date() 
        }))
    );
  }

  return userId;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveUserId(session);
    const searchParams = request.nextUrl.searchParams;
    const containsTitleId = searchParams.get('contains');
    const db = await getDb();

    let rows: any[] = [];
    const lists = await db.collection('lists').find({ user_id: userId }).sort({ created_at: 1 }).toArray();

    if (containsTitleId) {
      // Check which lists contain the title
      const listIds = lists.map(l => l._id.toString());
      const listIdsObj = lists.map(l => l._id);
      
      const items = await db.collection('list_items').find({
          list_id: { $in: [...listIds, ...listIdsObj] },
          title_id: containsTitleId
      }).toArray();
      
      const containingListIds = new Set(items.map(i => i.list_id.toString()));
      
      rows = lists.map(l => ({
          ...l,
          id: l._id.toString(), // Map _id to id
          has_title: containingListIds.has(l._id.toString()) ? 1 : 0
      }));
    } else {
      rows = lists.map(l => ({
          ...l,
          id: l._id.toString()
      }));
    }
    
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching lists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lists', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'List name is required' }, { status: 400 });
    }

    const userId = await resolveUserId(session);
    const db = await getDb();
    
    // Check if list with same name exists for this user
    const existingList = await db.collection('lists').findOne({ user_id: userId, name: name.trim() });
    
    if (existingList) {
       return NextResponse.json(
        { error: 'A list with this name already exists' },
        { status: 409 }
      );
    }
    
    const result = await db.collection('lists').insertOne({
        name: name.trim(),
        user_id: userId,
        created_at: new Date()
    });
    
    return NextResponse.json({ id: result.insertedId.toString(), name: name.trim(), user_id: userId });
  } catch (error) {
    console.error('Error creating list:', error);
    return NextResponse.json(
      { error: 'Failed to create list', message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, name } = await request.json();
    if (!id && !name) {
      return NextResponse.json({ error: 'List id or name required' }, { status: 400 });
    }

    const userId = await resolveUserId(session);
    const db = await getDb();

    let listId = id;
    if (!listId && name) {
      const list = await db.collection('lists').findOne({ user_id: userId, name: name.trim() });
      if (!list) {
        return NextResponse.json({ error: 'List not found' }, { status: 404 });
      }
      listId = list._id.toString();
    }

    // Must verify ownership implicitly via filter
    // If id is provided, we need to convert to ObjectId if possible, or string match
    // Depending on how frontend sends it. Since we mapped _id to string id in GET, frontend sends string.
    
    let filter: any = { user_id: userId };
    try {
        const { ObjectId } = await import('mongodb');
        filter._id = new ObjectId(listId);
    } catch {
        filter._id = listId; // Fallback if not valid objectid (though it should be)
    }

    // Delete items first
    // Need to find list first to correctly invoke deleteMany on items
    const listToDelete = await db.collection('lists').findOne(filter);
    
    if (!listToDelete) {
         return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    await db.collection('list_items').deleteMany({ 
        list_id: { $in: [listToDelete._id.toString(), listToDelete._id] }
    });
    
    const result = await db.collection('lists').deleteOne({ _id: listToDelete._id });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    console.error('Error deleting list:', error);
    return NextResponse.json(
      { error: 'Failed to delete list', message: error.message },
      { status: 500 }
    );
  }
}
