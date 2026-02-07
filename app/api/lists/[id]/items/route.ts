import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { ObjectId } from 'mongodb';

export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    const db = await getDb();
    
    // Check ownership
    // Try as ObjectId or String
    let filter: any = {};
    try {
        filter._id = new ObjectId(id);
    } catch {
        filter._id = id;
    }

    const list = await db.collection('lists').findOne(filter);
    
    if (!list) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    if (list.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // items use string representation of list id usually
    const listIdStr = list._id.toString();
    const rows = await db.collection('list_items').find({ 
        list_id: { $in: [listIdStr, list._id] } 
    }).sort({ added_at: -1 }).toArray();
    
    // map _id to id
    const mappedRows = rows.map(r => ({...r, id: r._id.toString()}));
    
    return NextResponse.json(mappedRows);
  } catch (error) {
    console.error('Error fetching list items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch list items', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { title_id } = await request.json();
      
    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }
    
    if (!title_id) {
      return NextResponse.json({ error: 'Title ID required' }, { status: 400 });
    }
    
    const db = await getDb();
    
    let filter: any = {};
    try {
        filter._id = new ObjectId(id);
    } catch {
        filter._id = id;
    }

    const listCheck = await db.collection('lists').findOne(filter);

    if (!listCheck) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }
    
    if (listCheck.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
   
    const listIdStr = listCheck._id.toString();

    // Check if item already exists in list
    const existing = await db.collection('list_items').findOne({ 
        list_id: { $in: [listIdStr, listCheck._id] }, 
        title_id 
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Item already in list', id: existing._id.toString(), list_id: id, title_id },
        { status: 409 }
      );
    }
    
    const result = await db.collection('list_items').insertOne({
        list_id: listIdStr,
        title_id,
        added_at: new Date()
    });
    
    return NextResponse.json({ id: result.insertedId.toString(), list_id: id, title_id });
  } catch (error) {
    console.error('Error adding list item:', error);
    return NextResponse.json(
      { error: 'Failed to add item to list', message: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const titleId = body?.title_id;
    const clear = body?.clear === true;

    if (!id) {
      return NextResponse.json({ error: 'List ID required' }, { status: 400 });
    }

    const db = await getDb();
    
    let filter: any = {};
    try {
        filter._id = new ObjectId(id);
    } catch {
        filter._id = id;
    }

    const listCheck = await db.collection('lists').findOne(filter);

    if (!listCheck) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (listCheck.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!clear && !titleId) {
      return NextResponse.json({ error: 'Title ID or clear flag required' }, { status: 400 });
    }

    let result;
    const listIdStr = listCheck._id.toString();

    if (clear) {
      result = await db.collection('list_items').deleteMany({
          list_id: { $in: [listIdStr, listCheck._id] }
      });
    } else {
      result = await db.collection('list_items').deleteMany({
          list_id: { $in: [listIdStr, listCheck._id] },
          title_id: titleId
      });
    }

    return NextResponse.json({
      success: true,
      deleted: result.deletedCount,
      list_id: id,
      title_id: titleId || null
    });
  } catch (error) {
    console.error('Error removing list item:', error);
    return NextResponse.json(
      { error: 'Failed to remove item from list', message: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { title_id, target_list_id } = await request.json();

    if (!id || !title_id || !target_list_id) {
      return NextResponse.json({ error: 'List ID, title ID, and target list ID required' }, { status: 400 });
    }

    const db = await getDb();
    
    let sourceFilter: any = {};
    let targetFilter: any = {};
    try {
        sourceFilter._id = new ObjectId(id);
        targetFilter._id = new ObjectId(target_list_id);
    } catch {
        sourceFilter._id = id;
        targetFilter._id = target_list_id;
    }

    const source = await db.collection('lists').findOne(sourceFilter);
    const target = await db.collection('lists').findOne(targetFilter);

    if (!source || !target) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    if (source.user_id !== session.user.id || target.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sourceIdStr = source._id.toString();
    const targetIdStr = target._id.toString();

    // Move logic
    await db.collection('list_items').deleteMany({
        list_id: { $in: [sourceIdStr, source._id] },
        title_id
    });
    
    const existingTarget = await db.collection('list_items').findOne({
        list_id: { $in: [targetIdStr, target._id] },
        title_id
    });
    
    if (!existingTarget) {
        await db.collection('list_items').insertOne({
            list_id: targetIdStr,
            title_id,
            added_at: new Date()
        });
    }

    return NextResponse.json({
      success: true,
      moved: true,
      list_id: id,
      target_list_id,
      title_id
    });
  } catch (error) {
    console.error('Error moving list item:', error);
    return NextResponse.json(
      { error: 'Failed to move item', message: error.message },
      { status: 500 }
    );
  }
}
