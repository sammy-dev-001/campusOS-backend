import mongoose from 'mongoose';
import User from './User.js';
import Post from './Post.js';
import Chat from './Chat.js';
import Message from './Message.js';
import Event from './Event.js';
import Notification from './Notification.js';
import Comment from './Comment.js';
import Poll from './Poll.js';
import Group from './Group.js';
import ForumThread from './ForumThread.js';
import ForumSubscription from './ForumSubscription.js';

// Import other models here
import './Announcement.js';
import './Document.js';
import './Timetable.js';
import './Tutor.js';

export {
  User,
  Post,
  Chat,
  Message,
  Event,
  Notification,
  Comment,
  Poll,
  Group,
  ForumThread,
  ForumSubscription
};

export default mongoose;
