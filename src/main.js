function updateSelectionUI() {
  const selectedCountEl = document.getElementById('selected-count');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');
  if (!selectedCountEl || !btnDeleteSelected) return;
  selectedCountEl.textContent = `${(typeof selectedChats !== 'undefined' ? selectedChats.length : 0)} selected`;
  btnDeleteSelected.disabled = (typeof selectedChats !== 'undefined' ? selectedChats.length : 0) === 0;
  btnDeleteSelected.style.opacity = btnDeleteSelected.disabled ? '0.5' : '1';
}
import { auth, db, provider } from './firebase-config.js';
import { initBeams, stopBeams } from './beams.js';
import { 
  getUserProfile, saveUserProfile, setupAuth, logoutUser, searchUserByPhone, addContact, getContacts,
  updateUserPresence, listenToUserPresence as listenToPresence, toggleBlockUser, setChatLockCode, toggleChatLock, uploadToImgBB, toggleFavourite, hideCallLog,
  updateUserProfile, deleteUserAccount
} from './auth.js';
import { 
  sendMessage, listenToRecentChats, clearChat, deleteChat, deleteSingleMessage, setupChat,
  setTypingStatus, listenToTyping as listenForTyping, toggleDisappearing, 
  editMessage, reactToMessage, removeReaction, pinMessage, unpinMessage
} from './chat.js';
import { 
  startCall, answerCall, rejectCall, endCall, toggleAudio, toggleVideo, 
  listenForIncomingCalls, requestVideoUpgrade, acceptVideoUpgrade, rejectVideoUpgrade,
  swapCamera, logCallHistory
} from './webrtc.js';
import { collection, query, where, orderBy, onSnapshot, limit, getDocs } from 'firebase/firestore';
import { setupMediaHandling, createVoicePlayer } from './media.js';

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg viewBox='0 0 24 24' fill='%23ffffff' xmlns='http://www.w3.org/2000/svg' style='background:%2394a3b8'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Determine base path to ensure SW registers correctly on GitHub Pages subfolder
    const baseUri = document.baseURI || window.location.href;
    const swPath = new URL('./sw.js', baseUri).href;
    
    navigator.serviceWorker.register(swPath).then((registration) => {
      console.log('PWA ServiceWorker registered successfully: ', registration.scope);
    }).catch((err) => {
      console.warn('PWA ServiceWorker registration failed: ', err);
    });
  });
}

// Screens
const loadingScreen = document.getElementById('loading-screen');
const loginScreen = document.getElementById('login-screen');
const profileScreen = document.getElementById('profile-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const chatScreen = document.getElementById('chat-screen');
const desktopEmptyState = document.getElementById('desktop-empty-state');

// Desktop view check
function updateDesktopView() {
  if (window.innerWidth >= 1024) {
    document.body.classList.add('desktop-view');
  } else {
    document.body.classList.remove('desktop-view');
  }
}
window.addEventListener('resize', updateDesktopView);
updateDesktopView();

// Dashboard Tabs & Nav
const hubTitle = document.getElementById('hub-title');
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const recentChatsList = document.getElementById('recent-chats-list');
const globalUnreadBadge = document.getElementById('global-unread-badge');
const dashboardMenuContainer = document.getElementById('dashboard-menu-container');
const btnDashboardMenu = document.getElementById('btn-dashboard-menu');
const dashboardDropdown = document.getElementById('dashboard-dropdown');
const btnSelectChats = document.getElementById('btn-select-chats');
const btnReadAll = document.getElementById('btn-read-all');
const filterBar = document.getElementById('chat-filters');
const filterPills = document.querySelectorAll('.filter-pill');
const selectionBar = document.getElementById('selection-bar');
const selectedCountEl = document.getElementById('selected-count');
const btnCancelSelect = document.getElementById('btn-cancel-select');
const btnDeleteSelected = document.getElementById('btn-delete-selected');


// Contacts Tab Elements
const inputSearchPhone = document.getElementById('input-search-phone');
const btnSearchUser = document.getElementById('btn-search-user');
const searchResultsContainer = document.getElementById('search-results');
const contactsListContainer = document.getElementById('contacts-list');

// Settings Elements
const settingsName = document.getElementById('settings-name');
const settingsAvatar = document.getElementById('settings-avatar');
const inputSettingsAvatar = document.getElementById('input-settings-avatar');
const settingsPhone = document.getElementById('settings-phone');
const settingsBio = document.getElementById('settings-bio');
const btnLogout = document.getElementById('btn-logout');
const themeToggle = document.getElementById('theme-toggle');
const radioPrivacyEverybody = document.getElementById('radio-privacy-everybody');
const radioPrivacyContacts = document.getElementById('radio-privacy-contacts');

// Profile Elements
const inputMyPhone = document.getElementById('input-my-phone');
const btnSaveProfile = document.getElementById('btn-save-profile');
const profileSetupAvatar = document.getElementById('profile-setup-avatar');
const inputSetupAvatar = document.getElementById('input-setup-avatar');

// Chat Elements
const chatUserNameEl = document.getElementById('chat-user-name');
const chatUserStatusEl = document.getElementById('chat-user-status');
const chatUserAvatarEl = document.getElementById('chat-user-avatar');
const btnBackDashboard = document.getElementById('btn-back-dashboard');
const messagesContainer = document.getElementById('chat-messages');
const chatTypingIndicator = document.getElementById('chat-typing-indicator');

// Admin Options UI
const btnDialVideo = document.getElementById('btn-dial-video');
const btnDialAudio = document.getElementById('btn-dial-audio');
const btnChatOptions = document.getElementById('btn-chat-options');
const chatOptionsMenu = document.getElementById('chat-options-menu');
const btnToggleDisappearing = document.getElementById('btn-toggle-disappearing');
const btnLockChat = document.getElementById('btn-lock-chat');
const btnBlockUser = document.getElementById('btn-block-user');
const btnClearChat = document.getElementById('btn-clear-chat');
const btnDeleteChat = document.getElementById('btn-delete-chat');
const disappearingBanner = document.getElementById('disappearing-banner');

const actionModal = document.getElementById('action-modal');
const modalTitle = document.getElementById('modal-title');
const btnModalMe = document.getElementById('btn-modal-me');
const btnModalEveryone = document.getElementById('btn-modal-everyone');
const btnModalCancel = document.getElementById('btn-modal-cancel');

// Contact Profile Screen Elements
const contactProfileScreen  = document.getElementById('contact-profile-screen');
const cpAvatar              = document.getElementById('cp-avatar');
const cpBgImg               = document.getElementById('cp-bg-img');
const cpName                = document.getElementById('cp-name');
const cpStatusText          = document.getElementById('cp-status-text');
const cpStatusDot           = document.getElementById('cp-status-dot');
const cpBio                 = document.getElementById('cp-bio');
const cpBioCard             = document.getElementById('cp-bio-card');
const cpPhone               = document.getElementById('cp-phone');
const cpEmail               = document.getElementById('cp-email');
const cpEmailCard           = document.getElementById('cp-email-card');
const cpBlockLabel          = document.getElementById('cp-block-label');
const btnCloseContactProfile = document.getElementById('btn-close-contact-profile');
const chatHeaderInfo        = document.getElementById('chat-header-info');
// Keep legacy ids pointing to null so nothing breaks
const friendProfileModal    = null;
const friendProfilePic      = null;
const friendProfileName     = null;
const friendProfilePhone    = null;
const friendProfileStatusText = null;
const btnCloseFriendProfile = null;

// Custom Prompt Elements
const promptModal = document.getElementById('prompt-modal');
const promptTitle = document.getElementById('prompt-title');
const promptDesc = document.getElementById('prompt-desc');
const promptInput = document.getElementById('prompt-input');
const btnPromptCancel = document.getElementById('btn-prompt-cancel');
const btnPromptSave = document.getElementById('btn-prompt-save');

// Message Action Elements
const msgActionMenu = document.getElementById('msg-action-menu');
const btnMsgReply = document.getElementById('btn-msg-reply');
const btnMsgPin = document.getElementById('btn-msg-pin');
const btnMsgForward = document.getElementById('btn-msg-forward');
const btnMsgDownload = document.getElementById('btn-msg-download');
const btnMsgDelete = document.getElementById('btn-msg-delete');
const btnMsgDeleteForMe = document.getElementById('btn-msg-delete-for-me');
const btnMsgCopy = document.getElementById('btn-msg-copy');
const btnMsgEdit = document.getElementById('btn-msg-edit');
const emojiBtns = document.querySelectorAll('.emoji-btn');

// Pinned Banner Elements
const pinnedMessageBanner = document.getElementById('pinned-message-banner');
const pinnedBannerText  = document.getElementById('pinned-banner-text');
const btnUnpinMsg = document.getElementById('btn-unpin-msg');

const forwardModal = document.getElementById('forward-modal');
const btnCloseForward = document.getElementById('btn-close-forward');
const forwardList = document.getElementById('forward-list');
const toastNotification = document.getElementById('toast-notification');

const replyPreviewContainer = document.getElementById('reply-preview-container');
const replyPreviewName = document.getElementById('reply-preview-name');
const replyPreviewText = document.getElementById('reply-preview-text');
const btnCancelReply = document.getElementById('btn-cancel-reply');

let currentAction = null;
let currentReplyContext = null;
let currentMessageActionContext = null;
let currentPinnedMsgId = null; // tracks pinned message in active chat

window.getCurrentReplyContext = () => currentReplyContext;
window.clearReplyContext = () => btnCancelReply.click();

// Input Area Elements
const inputMessage = document.getElementById('input-message');
const btnSend = document.getElementById('btn-send');
const btnVoice = document.getElementById('btn-voice');
const chatInputFooter = document.getElementById('chat-input-footer');
const blockedBanner = document.getElementById('blocked-banner');
const btnUnblockBanner = document.getElementById('btn-unblock-banner');

// Call UI Elements
const incomingCallModal = document.getElementById('incoming-call-modal');
const incomingCallAvatar = document.getElementById('incoming-call-avatar');
const incomingCallName = document.getElementById('incoming-call-name');
const incomingCallType = document.getElementById('incoming-call-type');
const btnAcceptCall = document.getElementById('btn-accept-call');
const btnDeclineCall = document.getElementById('btn-decline-call');
const activeCallScreen = document.getElementById('active-call-screen');
const activeCallName = document.getElementById('active-call-name');
const activeCallDuration = document.getElementById('active-call-duration');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const btnCallMute = document.getElementById('btn-call-mute');
const btnCallVideo = document.getElementById('btn-call-video');
const btnCallEnd = document.getElementById('btn-call-end');

let currentChatId = null;
let currentOtherUser = null;
let currentChatUnsubscribe = null;
let currentTypingUnsubscribe = null;
let currentPresenceUnsubscribe = null;
let recentChatsUnsubscribe = null;
let callListenerUnsubscribe = null; // cleanup for listenForIncomingCalls
let typingTimeout = null;

let currentRingingChatId = null;
let currentActiveCallId = null; // Track the connected call ID globally
let currentCallIsVideo = false;

// Ringtone Element
const ringtoneAudio = document.getElementById('ringtone-audio');

// Lightbox Elements
const imageLightbox = document.getElementById('image-lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxDownloadLink = document.getElementById('lightbox-download-link');
const lightboxClose = document.querySelector('.lightbox-close');

let myProfileData = null; // Store locally for instant access
let selectedAvatarFile = null;
let currentRecentChats = []; // Cache to allow safe repainting
let currentInboxMode = 'standard'; // 'standard' or 'locked'
let isSelectMode = false;
let selectedChats = [];
let currentFilter = 'all';
let currentSearchQuery = ''; // Chat search query

// Call Log Select State
let isCallSelectMode = false;
let selectedCallLogs = []; // Array of { id, logData }


// Utility: Modern Prompt Modal
function showPromptModal(title, desc, initialValue) {
   return new Promise((resolve) => {
       promptTitle.textContent = title;
       promptDesc.textContent = desc;
       promptInput.value = initialValue;
       promptModal.classList.remove('hidden');
       setTimeout(() => promptInput.focus(), 100);

       const cleanup = () => {
           btnPromptCancel.removeEventListener('click', onCancel);
           btnPromptSave.removeEventListener('click', onSave);
           promptModal.classList.add('hidden');
       };

       const onCancel = () => { cleanup(); resolve(null); };
       const onSave = () => { cleanup(); resolve(promptInput.value); };

       // Also allow pressing Enter
       promptInput.onkeydown = (e) => {
           if (e.key === 'Enter') onSave();
       };

       btnPromptCancel.addEventListener('click', onCancel);
       btnPromptSave.addEventListener('click', onSave);
   });
}

// Utility: Screen Transition
function switchScreen(screenToShow) {
  [loadingScreen, loginScreen, profileScreen, dashboardScreen, chatScreen, desktopEmptyState].forEach(s => {
    if (!s) return;
    if (s === screenToShow) {
      s.classList.remove('hidden');
      setTimeout(() => s.classList.add('active'), 50);
    } else {
      // Don't hide dashboard on desktop if we are showing chatScreen
      if (document.body.classList.contains('desktop-view') && screenToShow === chatScreen && s === dashboardScreen) {
         return; // Keep dashboard visible
      }
      // On desktop, if we switch to dashboard, the right panel should show empty state
      if (document.body.classList.contains('desktop-view') && screenToShow === dashboardScreen && s === desktopEmptyState) {
         s.classList.remove('hidden');
         setTimeout(() => s.classList.add('active'), 50);
         return;
      }
      s.classList.remove('active');
      setTimeout(() => s.classList.add('hidden'), 400);
    }
  });
}

function formatTime(dateObj) {
  if (!dateObj) return '';
  return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Returns a WhatsApp-style "last seen" string:
 *   today      → "last seen today at 14:30"
 *   yesterday  → "last seen yesterday at 14:30"
 *   this week  → "last seen Mon at 14:30"
 *   this year  → "last seen 31 Mar at 14:30"
 *   older      → "last seen 31 Mar 2024 at 14:30"
 */
function formatLastSeen(dateObj) {
  if (!dateObj) return 'offline';
  const now  = new Date();
  const date = dateObj instanceof Date ? dateObj : dateObj.toDate?.() || new Date(dateObj);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday - 86400000);
  const startOfWeek      = new Date(startOfToday - 6 * 86400000);

  if (date >= startOfToday) {
    return `last seen today at ${timeStr}`;
  } else if (date >= startOfYesterday) {
    return `last seen yesterday at ${timeStr}`;
  } else if (date >= startOfWeek) {
    const day = date.toLocaleDateString([], { weekday: 'short' });
    return `last seen ${day} at ${timeStr}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    const dayMonth = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    return `last seen ${dayMonth} at ${timeStr}`;
  } else {
    const full = date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
    return `last seen ${full} at ${timeStr}`;
  }
}

// Evaluate privacy rules and return the correct avatar
function getDisplayAvatar(otherUserObj) {
   const fallbackUrl = DEFAULT_AVATAR;
   const myUid = auth.currentUser ? auth.currentUser.uid : null;
   
   if (myUid && otherUserObj.blockedUsers && otherUserObj.blockedUsers.includes(myUid)) {
       return fallbackUrl;
   }
   
   const uploadedPhoto = otherUserObj.customPhotoURL || fallbackUrl;
   
   if (otherUserObj.privacyPicture === 'contacts') {
      if (!otherUserObj.contacts || !myUid || !otherUserObj.contacts.includes(myUid)) {
         return fallbackUrl;
      }
   }
   return uploadedPhoto;
}


// â”€â”€â”€ Date helper utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getDateKey(dateObj) {
  if (!dateObj) return '';
  const d = (dateObj instanceof Date) ? dateObj : dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function formatDateSeparator(dateObj) {
  if (!dateObj) return '';
  const d = (dateObj instanceof Date) ? dateObj : dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
  const now = new Date();
  const todayKey    = now.toISOString().slice(0, 10);
  const msgKey      = d.toISOString().slice(0, 10);
  const yesterdayDate = new Date(now); yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayKey  = yesterdayDate.toISOString().slice(0, 10);

  if (msgKey === todayKey)     return 'Today';
  if (msgKey === yesterdayKey) return 'Yesterday';
  // Show "Mon, 31 Mar" for current year; "31 Mar 2025" for older
  const opts = d.getFullYear() === now.getFullYear()
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString([], opts);
}

function formatCallDuration(secs) {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return m + ':' + s;
}

// â”€â”€â”€ Fetch call logs for the current chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let currentChatCallLogs = []; // module-level cache per open chat

async function fetchCallLogsForChat(myUid, otherUid) {
  try {
    const q1 = query(collection(db, 'callLogs'),
      where('callerId', '==', myUid),
      where('calleeId', '==', otherUid)
    );
    const q2 = query(collection(db, 'callLogs'),
      where('callerId', '==', otherUid),
      where('calleeId', '==', myUid)
    );
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const logs = [
      ...s1.docs.map(d => ({ id: d.id, _type: 'call', ...d.data() })),
      ...s2.docs.map(d => ({ id: d.id, _type: 'call', ...d.data() }))
    ];
    // Filter out hidden-for-me entries
    return logs.filter(l => !(l.hiddenFor && l.hiddenFor.includes(myUid)));
  } catch (e) {
    console.warn('fetchCallLogsForChat failed:', e);
    return [];
  }
}

// â”€â”€â”€ Show skeleton loading UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function showMessagesSkeleton(container) {
  const ROWS = [
    { side: 'left',  wide: true  },
    { side: 'right', wide: false },
    { side: 'left',  wide: false },
    { side: 'right', wide: true  },
  ];
  container.innerHTML = '<div class="messages-skeleton">' +
    ROWS.map(r =>
      '<div class="skeleton-row ' + r.side + '">' +
        '<div class="skeleton-bubble skeleton-base" style="width:' + (r.wide ? '58%' : '40%') + '"></div>' +
        '<div class="skeleton-meta skeleton-base"></div>' +
      '</div>'
    ).join('') +
  '</div>';
}

let _isFirstLoad = true; // tracks if this is the initial render for a chat

function renderMessages(messages) {
  const myUid = auth.currentUser ? auth.currentUser.uid : null;

  // â”€â”€ Merge in call logs chronologically â”€â”€
  const allLogs = currentChatCallLogs || [];
  const merged = [...messages, ...allLogs].sort((a, b) => {
    const ta = a._type === 'call' ? a.timestamp : (a.createdAt ? a.createdAt.toMillis() : 0);
    const tb = b._type === 'call' ? b.timestamp : (b.createdAt ? b.createdAt.toMillis() : 0);
    return ta - tb;
  });

  // â”€â”€ Smart Scroll Decision â”€â”€
  const wasAtBottom = _isFirstLoad ||
    (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 120);

  messagesContainer.innerHTML = '';
  let lastDateKey = '';

  merged.forEach(item => {
    // â”€â”€ Date Separator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let itemDate = null;
    if (item._type === 'call') {
      itemDate = new Date(item.timestamp);
    } else if (item.createdAt) {
      itemDate = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
    }

    if (itemDate) {
      const key = getDateKey(itemDate);
      if (key && key !== lastDateKey) {
        lastDateKey = key;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.innerHTML = '<span class="date-separator-label">' + formatDateSeparator(itemDate) + '</span>';
        messagesContainer.appendChild(sep);
      }
    }

    // â”€â”€ Call Event Bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (item._type === 'call') {
      const isOutgoing = item.callerId === myUid;
      const isMissed   = item.status === 'missed' || item.status === 'rejected';
      const isVideo    = item.type === 'video';
      const statusClass = isMissed ? 'missed' : 'answered';

      const dirLabel = isOutgoing ? 'Outgoing' : 'Incoming';
      const typeLabel = isVideo ? 'video call' : 'voice call';
      let mainLabel;
      if (isMissed) {
        mainLabel = isOutgoing ? 'Cancelled ' + typeLabel : 'Missed ' + typeLabel;
      } else {
        const dur = formatCallDuration(item.duration);
        mainLabel = (isVideo ? 'Video call' : 'Voice call') + (dur ? ' \u00b7 ' + dur : '');
      }

      const arrowIcon = isOutgoing ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt';
      const callbackIcon = isVideo ? 'bx-video' : 'bx-phone';
      const timeStr = itemDate ? itemDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

      const callEl = document.createElement('div');
      callEl.className = 'call-event';
      callEl.innerHTML =
        '<div class="call-event-pill ' + statusClass + '">' +
          '<i class="bx ' + (isVideo ? 'bx-video' : 'bx-phone') + ' call-event-icon"></i>' +
          '<div class="call-event-details">' +
            '<span class="call-event-label">' + mainLabel + '</span>' +
            '<span class="call-event-time">' + dirLabel + ' \u00b7 ' + timeStr + '</span>' +
          '</div>' +
          '<i class="bx ' + arrowIcon + ' call-event-arrow"></i>' +
          '<button class="call-event-callback" title="Call back">' +
            '<i class="bx ' + callbackIcon + '"></i>' +
          '</button>' +
        '</div>';

      // Callback button logic
      const callbackBtn = callEl.querySelector('.call-event-callback');
      callbackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = isVideo ? document.getElementById('btn-dial-video') : document.getElementById('btn-dial-audio');
        if (btn) btn.click();
      });

      messagesContainer.appendChild(callEl);
      return;
    }

    // â”€â”€ Normal Message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const msg  = item;
    const isMe = myUid && msg.uid === myUid;

    // Hide incoming messages from blocked users
    if (!isMe && myProfileData && myProfileData.blockedUsers && myProfileData.blockedUsers.includes(msg.uid)) return;

    const isPinned = currentPinnedMsgId && msg.id === currentPinnedMsgId;
    const msgEl = document.createElement('div');
    msgEl.className = 'message ' + (isMe ? 'sent' : 'received') + (isPinned ? ' pinned-msg' : '');
    msgEl.dataset.msgid = msg.id;

    let contentHtml = '';

    if (msg.isDeleted) {
      contentHtml  = '<div style="color:rgba(255,255,255,0.6);font-style:italic;display:flex;align-items:center;gap:5px;font-size:0.9rem;">';
      contentHtml += '<i class="bx bx-block"></i> ' + (isMe ? 'You deleted this message' : 'This message was deleted');
      contentHtml += '</div>';
      const ts = msg.createdAt ? formatTime(msg.createdAt.toDate()) : '...';
      contentHtml += '<div class="meta">' + ts + '</div>';
      msgEl.innerHTML = contentHtml;
      msgEl.addEventListener('click', e => {
        e.stopPropagation();
        currentMessageActionContext = { msgId: msg.id, text: null, imageUrl: null, audioUrl: null, isDeleted: true, isMe };
        [btnMsgReply, btnMsgPin, btnMsgEdit, btnMsgCopy, btnMsgForward, btnMsgDownload, btnMsgDelete].forEach(b => { if(b) b.classList.add('hidden'); });
        const reactionBar = document.getElementById('emoji-reaction-bar');
        if (reactionBar) reactionBar.style.display = 'none';
        if (btnMsgDeleteForMe) btnMsgDeleteForMe.classList.remove('hidden');
        msgActionMenu.classList.remove('hidden');
      });
      if (isPinned) { const pd = document.createElement('div'); pd.className='pin-indicator'; pd.innerHTML='<i class="bx bxs-pin"></i>'; msgEl.appendChild(pd); }
      messagesContainer.appendChild(msgEl);
      return;
    }

    if (msg.replyTo) {
      contentHtml += '<div class="reply-citation"><div class="reply-name">' + msg.replyTo.senderName + '</div><div class="reply-text">' + msg.replyTo.textSnippet + '</div></div>';
    }
    if (msg.imageUrl) contentHtml += '<img src="' + msg.imageUrl + '" alt="Photo" class="message-img" />';
    if (msg.audioUrl) contentHtml += '<div class="voice-player-placeholder" data-audio="' + msg.audioUrl + '" data-dur="' + (msg.audioDuration || 0) + '"></div>';
    if (msg.text) {
      const tmp = document.createElement('div');
      tmp.textContent = msg.text;
      contentHtml += '<div>' + tmp.innerHTML + '</div>';
    }

    const ts = msg.createdAt ? formatTime(msg.createdAt.toDate()) : '...';
    contentHtml += '<div class="meta">';
    if (msg.isEdited) contentHtml += '<span style="font-size:0.65rem;margin-right:4px;opacity:0.8;">Edited</span>';
    contentHtml += ts;
    if (isMe) {
      const isRead = msg.status === 'read';
      const tickClass = isRead ? 'read' : 'sent';
      const icon = isRead ? 'bx-check-double' : 'bx-check';
      contentHtml += '<span class="ticks ' + tickClass + '"><i class="bx ' + icon + '"></i></span>';
    }
    contentHtml += '</div>';

    if (msg.reactions) {
      const distinct = [...new Set(Object.values(msg.reactions))];
      if (distinct.length > 0) {
        contentHtml += '<div class="reaction-pill">';
        distinct.slice(0, 3).forEach(e => contentHtml += '<span>' + e + '</span>');
        const total = Object.keys(msg.reactions).length;
        if (total > 1) contentHtml += '<span style="margin-left:2px;font-weight:bold;font-size:0.75rem;">' + total + '</span>';
        contentHtml += '</div>';
      }
    }

    msgEl.innerHTML = contentHtml;

    // ── Hydrate voice message players ──────────────────────────────
    msgEl.querySelectorAll('.voice-player-placeholder').forEach(placeholder => {
      const audioUrl = placeholder.dataset.audio;
      const dur      = parseInt(placeholder.dataset.dur, 10) || 0;
      const player   = createVoicePlayer(audioUrl, dur);
      placeholder.replaceWith(player);
    });

    if (isPinned) { const pd = document.createElement('div'); pd.className='pin-indicator'; pd.innerHTML='<i class="bx bxs-pin"></i>'; msgEl.appendChild(pd); }

    msgEl.querySelectorAll('.message-img').forEach(img => {
      img.addEventListener('click', e => {
        e.stopPropagation();
        if (lightboxImage && imageLightbox && lightboxDownloadLink) {
          lightboxImage.src = img.src; lightboxDownloadLink.href = img.src;
          imageLightbox.classList.remove('hidden');
        }
      });
    });

    msgEl.addEventListener('click', e => {
      e.stopPropagation();
      currentMessageActionContext = {
        msgId: msg.id, text: msg.text, imageUrl: msg.imageUrl, audioUrl: msg.audioUrl,
        isDeleted: false, isMe,
        senderName: isMe ? 'You' : (myProfileData && myProfileData.contactNames && myProfileData.contactNames[msg.uid] ? myProfileData.contactNames[msg.uid] : (currentOtherUser && currentOtherUser.displayName ? currentOtherUser.displayName : 'Unknown')),
        myReaction: (msg.reactions && auth.currentUser) ? msg.reactions[auth.currentUser.uid] : null
      };
      const reactionBar = document.getElementById('emoji-reaction-bar');
      if (reactionBar) reactionBar.style.display = '';
      emojiBtns.forEach(b => { b.textContent === currentMessageActionContext.myReaction ? b.classList.add('active') : b.classList.remove('active'); });
      msg.text ? btnMsgCopy.classList.remove('hidden') : btnMsgCopy.classList.add('hidden');
      (isMe && msg.text && !msg.imageUrl && !msg.audioUrl) ? btnMsgEdit.classList.remove('hidden') : btnMsgEdit.classList.add('hidden');
      msg.imageUrl ? btnMsgDownload.classList.remove('hidden') : btnMsgDownload.classList.add('hidden');
      if (btnMsgPin) {
        const alreadyPinned = currentPinnedMsgId && msg.id === currentPinnedMsgId;
        btnMsgPin.innerHTML = alreadyPinned ? '<i class="bx bx-pin"></i> Unpin Message' : '<i class="bx bxs-pin"></i> Pin Message';
        btnMsgPin.classList.remove('hidden');
      }
      if (btnMsgDeleteForMe) btnMsgDeleteForMe.classList.add('hidden');
      if (btnMsgDelete) btnMsgDelete.classList.remove('hidden');
      if (btnMsgForward) btnMsgForward.classList.remove('hidden');
      if (btnMsgReply) btnMsgReply.classList.remove('hidden');
      msgActionMenu.classList.remove('hidden');
    });

    messagesContainer.appendChild(msgEl);
  });

  // â”€â”€ Smart Scroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (wasAtBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  _isFirstLoad = false;
}

async function renderCallsTab() {
  const callsList = document.getElementById('calls-list');
  const callsSelectionBar = document.getElementById('calls-selection-bar');
  const callsSelectedCount = document.getElementById('calls-selected-count');
  if (!callsList || !auth.currentUser) return;

  const myUid = auth.currentUser.uid;
  const qCaller = query(collection(db, 'callLogs'), where('callerId', '==', myUid));
  const qCallee = query(collection(db, 'callLogs'), where('calleeId', '==', myUid));

  try {
      const [snap1, snap2] = await Promise.all([getDocs(qCaller), getDocs(qCallee)]);
      let allLogs = [
          ...snap1.docs.map(d => ({ id: d.id, ...d.data() })),
          ...snap2.docs.map(d => ({ id: d.id, ...d.data() }))
      ];

      // Filter out logs soft-deleted by this user
      allLogs = allLogs.filter(log => !(log.hiddenFor && log.hiddenFor.includes(myUid)));

      const uniqueLogs = [];
      const seen = new Set();
      for (const log of allLogs) {
          const key = log.timestamp + '_' + log.callerId;
          if (!seen.has(key)) { seen.add(key); uniqueLogs.push(log); }
      }
      uniqueLogs.sort((a, b) => b.timestamp - a.timestamp);
      allLogs = uniqueLogs.slice(0, 50);

      // Update selection bar visibility
      if (callsSelectionBar) callsSelectionBar.classList.toggle('hidden', !isCallSelectMode);
      if (callsSelectedCount) callsSelectedCount.textContent = selectedCallLogs.length + ' selected';

      if (allLogs.length === 0) {
          callsList.innerHTML = '<div style="padding: 50px 20px; text-align: center; color: #94a3b8;"><i class="bx bx-phone-call" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.3;"></i><p>No call history yet.</p></div>';
          return;
      }

      callsList.innerHTML = '';
      for (const log of allLogs) {
          const otherId = log.callerId === myUid ? log.calleeId : log.callerId;
          const otherUser = await getUserProfile(otherId);
          const aliasName = myProfileData && myProfileData.contactNames && myProfileData.contactNames[otherId] ? myProfileData.contactNames[otherId] : (otherUser && otherUser.displayName ? otherUser.displayName : 'Unknown');
          const avatar = (otherUser && otherUser.customPhotoURL) ? otherUser.customPhotoURL : DEFAULT_AVATAR;
          const isOutgoing = log.callerId === myUid;
          const isSelected = selectedCallLogs.some(s => s.id === log.id);

          let statusIcon = '';
          let statusText = '';
          let statusClass = '';

          if (log.status === 'completed') {
              statusIcon = isOutgoing ? "<i class='bx bx-redo status-incoming'></i>" : "<i class='bx bx-undo status-incoming'></i>";
              statusText = log.type.charAt(0).toUpperCase() + log.type.slice(1) + ' Call (' + Math.floor(log.duration / 60) + ':' + (log.duration % 60).toString().padStart(2, '0') + ')';
          } else if (log.status === 'missed' || log.status === 'rejected') {
              statusIcon = "<i class='bx bx-error-circle status-missed'></i>";
              statusText = isOutgoing ? 'Cancelled ' + log.type + ' call' : 'Missed ' + log.type + ' call';
              statusClass = 'status-missed';
          }

          const date = new Date(log.timestamp);
          const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dayStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

          const div = document.createElement('div');
          div.className = 'call-log-item' + (isSelected ? ' selected' : '');

          const checkboxHtml = isCallSelectMode ? '<div class="rc-selection"><i class="bx ' + (isSelected ? 'bxs-check-circle' : 'bx-circle') + '"></i></div>' : '';
          const actionStyle = isCallSelectMode ? 'display:none;' : '';
          const callIcon = log.type === 'video' ? 'bx-video' : 'bx-phone';

          div.innerHTML = checkboxHtml +
              '<img src="' + avatar + '" class="cl-avatar" />' +
              '<div class="cl-content">' +
                '<div class="cl-top">' +
                  '<span class="cl-name ' + statusClass + '">' + aliasName + '</span>' +
                  '<span class="cl-time">' + dayStr + ', ' + timeStr + '</span>' +
                '</div>' +
                '<div class="cl-bottom">' + statusIcon + '<span>' + statusText + '</span></div>' +
              '</div>' +
              '<div class="cl-action" style="' + actionStyle + '">' +
                '<i class="bx ' + callIcon + '"></i>' +
              '</div>';

          (function(capturedLog, capturedOtherUser) {
              div.addEventListener('click', function() {
                  if (isCallSelectMode) {
                      var idx = selectedCallLogs.findIndex(function(s) { return s.id === capturedLog.id; });
                      if (idx >= 0) selectedCallLogs.splice(idx, 1);
                      else selectedCallLogs.push({ id: capturedLog.id });
                      updateCallSelectionUI();
                      renderCallsTab();
                      return;
                  }
                  if (capturedOtherUser) startChat(capturedOtherUser);
              });
          })(log, otherUser);

          callsList.appendChild(div);
      }
  } catch (err) {
      console.error('Error loading call history:', err);
  }
}

function updateCallSelectionUI() {
    var countEl = document.getElementById('calls-selected-count');
    var deleteBtn = document.getElementById('btn-delete-call-selected');
    if (countEl) countEl.textContent = selectedCallLogs.length + ' selected';
    if (deleteBtn) {
        deleteBtn.disabled = selectedCallLogs.length === 0;
        deleteBtn.style.opacity = selectedCallLogs.length === 0 ? '0.5' : '1';
    }
}

function renderRecentChats(chats) {
  currentRecentChats = chats; // Cache for manual repaints
  
  recentChatsList.innerHTML = '';
  let totalUnreads = 0;

  const visibleChats = chats.filter(chat => {
      const isLocked = myProfileData?.lockedChats?.includes(chat.id);
      const isFavourite = myProfileData?.favouriteChats?.includes(chat.id);
      const myUid = auth.currentUser.uid;
      const unreadCount = chat.unreadCount ? (chat.unreadCount[myUid] || 0) : 0;

      // First check locked status
      const lockMatch = currentInboxMode === 'locked' ? isLocked : !isLocked;
      if (!lockMatch) return false;

      // Then check tab filter
      if (currentFilter === 'unread') { if (!(unreadCount > 0)) return false; }
      else if (currentFilter === 'favourites') { if (!isFavourite) return false; }

      // Then apply search query
      if (currentSearchQuery) {
          const q = currentSearchQuery.toLowerCase();
          const otherUid = chat.participants ? chat.participants.find(p => p !== myUid) : null;
          const alias = otherUid ? (myProfileData?.contactNames?.[otherUid] || '') : '';
          const displayName = otherUid ? (chat.participantDetails?.[otherUid]?.displayName || '') : '';
          const lastMsg = chat.lastMessage || '';
          const matchName = alias.toLowerCase().includes(q) || displayName.toLowerCase().includes(q);
          const matchMsg  = lastMsg.toLowerCase().includes(q);
          if (!matchName && !matchMsg) return false;
      }

      return true;
  });

  if (visibleChats.length === 0) {
    if (currentSearchQuery) {
        recentChatsList.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; text-align: center; margin-top: 2rem;">No chats match your search.</p>';
    } else if (currentInboxMode === 'locked') {
        recentChatsList.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; text-align: center; margin-top: 2rem;">No locked chats.</p>';
    } else {
        recentChatsList.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; text-align: center; margin-top: 2rem;">No recent chats yet. Search for a friend to start!</p>';
    }
    globalUnreadBadge.classList.add('hidden');
    return;
  }
  
  visibleChats.forEach(chat => {
    const myUid = auth.currentUser.uid;
    const otherUid = chat.participants.find(p => p !== myUid);
    const otherDetails = chat.participantDetails[otherUid] || { displayName: 'Unknown', photoURL: DEFAULT_AVATAR };
    
    // Resolve alias
    const aliasName = myProfileData?.contactNames?.[otherUid] || otherDetails.displayName;
    
    // Fallback to placeholder if not evaluated
    const displayAvatar = otherDetails.privacyAvatar || otherDetails.customPhotoURL || DEFAULT_AVATAR;
    
    const timeString = chat.updatedAt ? formatTime(chat.updatedAt.toDate()) : '';
    const unreadCount = chat.unreadCount ? (chat.unreadCount[myUid] || 0) : 0;
    totalUnreads += unreadCount;

    let displayLastMsg = chat.lastMessage || '';

    // Only show type label if there's no real lastMessage text to show
    if (!displayLastMsg) {
      if (chat.lastMessageType === 'image')             displayLastMsg = '📷 Photo';
      else if (chat.lastMessageType === 'audio')        displayLastMsg = '🎤 Voice message';
      else if (chat.lastMessageType === 'call_voice')   displayLastMsg = '📞 Voice call';
      else if (chat.lastMessageType === 'call_video')   displayLastMsg = '📹 Video call';
      else if (chat.lastMessageType === 'call_missed_voice') displayLastMsg = '🚫 Missed voice call';
      else if (chat.lastMessageType === 'call_missed_video') displayLastMsg = '🚫 Missed video call';
      else                                              displayLastMsg = '...';
    }

    const isCleared = chat.clearedFor && chat.clearedFor[myUid] === true;
    if (isCleared) displayLastMsg = '...';

    let lastMsgHtml = `<span class="rc-last-msg">${displayLastMsg}</span>`;
    if (!isCleared && chat.lastSenderId === myUid) {
      const theirUnreads = chat.unreadCount ? (chat.unreadCount[otherUid] || 0) : 0;
      if (theirUnreads === 0) {
        lastMsgHtml = `<i class='bx bx-check-double' style="color: #10b981; font-size: 1rem; margin-right: 3px; position:relative; top:2px;"></i>` + lastMsgHtml;
      } else {
        lastMsgHtml = `<i class='bx bx-check' style="color: #94a3b8; font-size: 1rem; margin-right: 3px; position:relative; top:2px;"></i>` + lastMsgHtml;
      }
    } else if (unreadCount > 0) {
      lastMsgHtml += `<div class="unread-badge" style="margin-left: auto;">${unreadCount}</div>`;
    }
    
    const isFavourite = myProfileData?.favouriteChats?.includes(chat.id);
    const isSelected = selectedChats.includes(chat.id);

    const card = document.createElement('div');
    card.className = `recent-chat-item ${isSelected ? 'selected' : ''}`;
    
    // If we're looking at a locked chat that was revealed via searching the secret code, add animation
    const isLocked = myProfileData?.lockedChats?.includes(chat.id);
    if (isLocked) {
        card.classList.add('locked-chat-reveal');
    }
    
    card.innerHTML = `
      ${isSelectMode ? `<div class="rc-selection"><i class='bx ${isSelected ? 'bx-check-square' : 'bx-square'}'></i></div>` : ''}
      <img src="${displayAvatar}" class="rc-avatar" />
      <div class="rc-content">
        <div class="rc-top">
          <span class="rc-name">${aliasName}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class='bx ${isFavourite ? 'bxs-star active' : 'bx-star'} favourite-star' data-chatid="${chat.id}"></i>
            <span class="rc-time" style="${unreadCount > 0 ? 'color: #10b981; font-weight: bold;' : ''}">${timeString}</span>
          </div>
        </div>
        <div class="rc-bottom" style="width: 100%;">
          ${lastMsgHtml}
        </div>
      </div>
    `;

    // Favourite Toggle Listener
    const starBtn = card.querySelector('.favourite-star');
    starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = starBtn.dataset.chatid;
        const isCurrFav = myProfileData?.favouriteChats?.includes(cid);
        const newFavStatus = !isCurrFav;

        // Optimistically update local cache so UI refreshes instantly
        if (!myProfileData) myProfileData = {};
        if (!myProfileData.favouriteChats) myProfileData.favouriteChats = [];
        if (newFavStatus) {
            myProfileData.favouriteChats = [...myProfileData.favouriteChats, cid];
        } else {
            myProfileData.favouriteChats = myProfileData.favouriteChats.filter(id => id !== cid);
        }

        // Re-render immediately with updated local data
        renderRecentChats(currentRecentChats);

        // Persist to Firestore in the background
        toggleFavourite(auth.currentUser.uid, cid, newFavStatus);
    });

    card.addEventListener('click', async () => {
       if (isSelectMode) {
           if (isSelected) {
               selectedChats = selectedChats.filter(id => id !== chat.id);
           } else {
               selectedChats.push(chat.id);
           }
           updateSelectionUI();
           renderRecentChats(currentRecentChats);
           return;
       }
       // Re-fetch fresh profile for privacy rules
       const freshProfile = await getUserProfile(otherUid);
       startChat({ uid: otherUid, ...(freshProfile || otherDetails) });
    });
    recentChatsList.appendChild(card);
  });

  if (totalUnreads > 0) {
    globalUnreadBadge.textContent = totalUnreads;
    globalUnreadBadge.classList.remove('hidden');
  } else {
    globalUnreadBadge.classList.add('hidden');
  }
}

async function renderContactsTab() {
  const myUid = auth.currentUser.uid;
  const contacts = await getContacts(myUid);
  
  contactsListContainer.innerHTML = '';
  if (contacts.length === 0) {
     contactsListContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem; text-align: center; margin-top: 1rem;">No contacts saved.</p>';
     return;
  }

  contacts.forEach(contact => {
     const avatar = getDisplayAvatar(contact);
     const aliasName = myProfileData?.contactNames?.[contact.uid] || contact.displayName;
     
     const card = document.createElement('div');
     card.className = 'recent-chat-item';
     card.innerHTML = `
       <img src="${avatar}" class="rc-avatar" />
       <div class="rc-content">
         <div class="rc-top" style="align-items: center;">
           <span class="rc-name">${aliasName}</span>
           <button class="edit-contact-btn" title="Edit Contact Name" style="background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 4px; border-radius: 4px;"><i class='bx bx-pencil' style="font-size: 1.1rem;"></i></button>
         </div>
         <div class="rc-bottom" style="width: 100%;">
           <span class="rc-last-msg">${contact.phoneNumber || 'Friend'}</span>
         </div>
       </div>
     `;
     
     card.querySelector('.edit-contact-btn').addEventListener('click', async (e) => {
         e.stopPropagation(); // prevent opening chat
         const newName = await showPromptModal("Edit Contact Name", "Enter a new alias for this contact.", aliasName);
         if (newName !== null && newName.trim() !== '') {
             const btn = card.querySelector('.edit-contact-btn');
             btn.innerHTML = `<i class='bx bx-loader bx-spin'></i>`;
             await addContact(auth.currentUser.uid, contact.uid, newName);
             const freshProfile = await getUserProfile(auth.currentUser.uid);
             myProfileData = freshProfile;
             
             // Re-render everything aggressively to update global aliases immediately
             renderContactsTab();
             renderRecentChats(currentRecentChats); 
         }
     });

     card.addEventListener('click', () => {
        startChat(contact);
     });
     contactsListContainer.appendChild(card);
  });
}

function startChat(otherUser) {
  if (!auth.currentUser) return;
  const myUid = auth.currentUser.uid;
  const otherUid = otherUser.uid;
  
  currentChatId = [myUid, otherUid].sort().join('_');
  
  // Apply privacy wrapper
  const avatar = getDisplayAvatar(otherUser);
  // Persist the evaluated avatar so it stays fast
  currentOtherUser = { ...otherUser, privacyAvatar: avatar }; 
  
  const isBlocked = myProfileData?.blockedUsers?.includes(otherUid);
  
  // Setup UI
  const aliasName = myProfileData?.contactNames?.[otherUid] || otherUser.displayName || 'Unknown';
  chatUserNameEl.textContent = aliasName;
  chatUserAvatarEl.src = avatar;
  chatTypingIndicator.classList.add('hidden');
  chatUserStatusEl.textContent = '...';
  chatOptionsMenu.classList.add('hidden');
  disappearingBanner.classList.add('hidden');
  
  if (isBlocked) {
     chatInputFooter.classList.add('hidden');
     blockedBanner.classList.remove('hidden');
     btnBlockUser.innerHTML = "<i class='bx bx-check-shield'></i> Unblock User";
  } else {
     chatInputFooter.classList.remove('hidden');
     blockedBanner.classList.add('hidden');
     btnBlockUser.innerHTML = "<i class='bx bx-block'></i> Block User";
  }

  const amIBlockedByThem = otherUser.blockedUsers && otherUser.blockedUsers.includes(myUid);
  if (isBlocked || amIBlockedByThem) {
      if(btnDialVideo) btnDialVideo.classList.add('hidden');
      if(btnDialAudio) btnDialAudio.classList.add('hidden');
  } else {
      if(btnDialVideo) btnDialVideo.classList.remove('hidden');
      if(btnDialAudio) btnDialAudio.classList.remove('hidden');
  }

  const isLocked = myProfileData?.lockedChats?.includes(currentChatId);
  btnLockChat.innerHTML = isLocked ? "<i class='bx bx-lock-open-alt'></i> Unlock Chat" : "<i class='bx bx-lock-alt'></i> Lock Chat";
  
  if (currentChatUnsubscribe) currentChatUnsubscribe();
  if (currentTypingUnsubscribe) currentTypingUnsubscribe();
  if (currentPresenceUnsubscribe) currentPresenceUnsubscribe();

  // Reset for new conversation
  _isFirstLoad = true;
  currentChatCallLogs = [];
  currentPinnedMsgId = null;
  if (pinnedMessageBanner) pinnedMessageBanner.classList.add('hidden');

  // Show skeleton while Firestore loads
  showMessagesSkeleton(messagesContainer);
  switchScreen(chatScreen);

  // Fetch call logs for this conversation (async, non-blocking)
  fetchCallLogsForChat(myUid, otherUid).then(logs => {
    currentChatCallLogs = logs;
    // No need to force re-render — setupChat will fire its callback with messages shortly
  });

  currentChatUnsubscribe = setupChat(currentChatId, renderMessages, (chatData) => {
      // Handle Disappearing Status visually
      if (chatData && chatData.disappearing) {
          disappearingBanner.classList.remove('hidden');
          btnToggleDisappearing.innerHTML = "<i class='bx bx-timer'></i> Disable Disappearing";
      } else {
          disappearingBanner.classList.add('hidden');
          btnToggleDisappearing.innerHTML = "<i class='bx bx-timer'></i> Disappearing Msgs";
      }

      // Handle Pinned Message Banner
      if (chatData && chatData.pinnedMessage && chatData.pinnedMessage.id) {
          currentPinnedMsgId = chatData.pinnedMessage.id;
          if (pinnedMessageBanner) pinnedMessageBanner.classList.remove('hidden');
          if (pinnedBannerText) pinnedBannerText.textContent = chatData.pinnedMessage.text || '📌 Pinned Message';
      } else {
          currentPinnedMsgId = null;
          if (pinnedMessageBanner) pinnedMessageBanner.classList.add('hidden');
      }
  }, myProfileData?.blockedUsers || []);

  currentTypingUnsubscribe = listenForTyping(currentChatId, (typingData) => {
    const isOtherTyping = typingData[otherUid] === true;
    const amIBlockedByThem = currentOtherUser.blockedUsers && currentOtherUser.blockedUsers.includes(myUid);
    const didIBlockThem = myProfileData?.blockedUsers?.includes(otherUid);
    
    if (isOtherTyping && (!amIBlockedByThem && !didIBlockThem)) {
      chatTypingIndicator.classList.remove('hidden');
    } else {
      chatTypingIndicator.classList.add('hidden');
    }
  });

  currentPresenceUnsubscribe = listenToPresence(otherUid, (status, lastActive) => {
    const amIBlockedByThem = currentOtherUser.blockedUsers && currentOtherUser.blockedUsers.includes(myUid);
    const didIBlockThem = myProfileData?.blockedUsers?.includes(otherUid);
    if (amIBlockedByThem || didIBlockThem) {
        chatUserStatusEl.textContent = '';
        return;
    }
    
    if (status === 'online') {
      chatUserStatusEl.textContent = 'Online';
      chatUserStatusEl.style.color = '#10b981';
    } else {
      chatUserStatusEl.style.color = '#94a3b8';
      chatUserStatusEl.textContent = lastActive ? formatLastSeen(lastActive.toDate()) : 'offline';
    }
  });
}

function initApp() {
  // Bind Setup File Upload
  profileSetupAvatar.addEventListener('click', () => inputSetupAvatar.click());
  inputSetupAvatar.addEventListener('change', (e) => {
     selectedAvatarFile = e.target.files[0];
     if(selectedAvatarFile) {
        profileSetupAvatar.src = URL.createObjectURL(selectedAvatarFile);
     }
  });

  // Bind Settings File Upload
  settingsAvatar.addEventListener('click', () => inputSettingsAvatar.click());
  inputSettingsAvatar.addEventListener('change', async (e) => {
     const file = e.target.files[0];
     if(file) {
        settingsAvatar.src = URL.createObjectURL(file);
        const spinner = document.getElementById('settings-avatar-spinner');
        if(spinner) spinner.classList.remove('hidden');
        
        const result = await uploadToImgBB(file);
        
        if(spinner) spinner.classList.add('hidden');
        if(result && result.url) {
           await saveUserProfile(auth.currentUser.uid, myProfileData.phoneNumber, result.url, myProfileData.privacyPicture);
           myProfileData.customPhotoURL = result.url;
        }
     }
  });

  const imageLightbox = document.getElementById('image-lightbox');
  const lightboxImage = document.getElementById('lightbox-image');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');
  const logoContainer = document.querySelector('.logo-container');
  if (logoContainer) logoContainer.classList.add('pulse-animation');

  // --- Notification System Setup ---
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.permission === 'granted' || await Notification.requestPermission();
    }
  }

  function showLocalNotification(title, body) {
    if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      new Notification(title, {
        body,
        icon: './icon.svg',
        vibrate: [200, 100, 200]
      });
    }
  }

  // ─── Call Status Display ────────────────────────────────────────────────────
  // Checks if the callee is online (via Socket.IO map on server) and updates
  // the status text on the active call screen accordingly.
  //
  //   Offline  →  "Calling..."   (push notification was sent via Beams)
  //   Online   →  "Ringing..."   (their device is actively ringing)
  //   Answered →  timer starts   (handled by webrtc.js when status === 'connected')
  //
  async function checkCalleeStatus(calleeUid) {
    const durationEl = document.getElementById('active-call-duration');
    if (!durationEl) return;

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

    try {
      const res = await fetch(`${serverUrl}/api/online/${calleeUid}`);
      const { online } = await res.json();

      // Only update if the call screen is still showing and no timer is running yet
      if (!activeCallScreen.classList.contains('hidden') && durationEl.textContent !== '0:00') {
        if (online) {
          // Recipient is in the app — their incoming call modal is ringing
          durationEl.innerHTML = `<span class="call-status-ringing">Ringing<span class="dot-pulse"></span></span>`;
        } else {
          // Recipient is offline — push notification delivered via Beams
          durationEl.innerHTML = `<span class="call-status-calling">Calling<span class="dot-pulse"></span></span>`;
        }
      }
    } catch (_) {
      // Server unreachable — just keep the default "Calling..." text
    }
  }

  // --- Theme Initial Setup ---
  const lightboxClose = document.querySelector('.lightbox-close');

  if(lightboxClose) lightboxClose.addEventListener('click', () => {
    imageLightbox.classList.add('hidden');
  });
  
  if(imageLightbox) imageLightbox.addEventListener('click', (e) => {
    if(e.target === imageLightbox) imageLightbox.classList.add('hidden');
  });

  function openImageLightbox(url) {
    if(!url) return;
    lightboxImage.src = url;
    lightboxDownloadLink.href = url;
    imageLightbox.classList.remove('hidden');
  }

  // --- Theme Initial Setup ---
  radioPrivacyEverybody.addEventListener('change', async () => {
      myProfileData.privacyPicture = 'everybody';
      await saveUserProfile(auth.currentUser.uid, myProfileData.phoneNumber, myProfileData.customPhotoURL, 'everybody');
  });

  radioPrivacyContacts.addEventListener('change', async () => {
      myProfileData.privacyPicture = 'contacts';
      await saveUserProfile(auth.currentUser.uid, myProfileData.phoneNumber, myProfileData.customPhotoURL, 'contacts');
  });

  // Handle Theme Toggling
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
     document.body.classList.add('light-mode');
     themeToggle.checked = false;
  }
  
  themeToggle.addEventListener('change', (e) => {
     if (e.target.checked) {
         document.body.classList.remove('light-mode');
         localStorage.setItem('theme', 'dark');
     } else {
         document.body.classList.add('light-mode');
         localStorage.setItem('theme', 'light');
     }
  });

  // ── Service Worker Push Navigation listener ────────────────────────────────
  // When a push notification is clicked and the app is already open, the SW
  // sends a postMessage so the app can deep-link to the right chat/call screen.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, notifType, chatId } = event.data || {};
      if (type !== 'PUSH_NAVIGATE' || !chatId) return;

      if (notifType === 'call') {
        // Surface the incoming call modal if the call is still ringing
        if (currentRingingChatId === chatId) {
          incomingCallModal.classList.remove('hidden');
        }
      } else if (notifType === 'message') {
        // Open the relevant chat by finding the contact and calling startChat
        // (The chat listener fires via Firestore hydration — just ensure we're on dashboard)
        if (document.getElementById('dashboard-screen')?.classList.contains('hidden')) {
          document.getElementById('btn-back-dashboard')?.click();
        }
      }
    });
  }

  // ── Handle cold-start URL params (app opened from push notification) ───────
  (() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('incomingCall') === '1') {
      // The app was opened from a call push — the Firestore listener in
      // listenForIncomingCalls will surface the modal automatically once auth resolves.
      console.log('[Beams] Cold-start from call notification, chatId:', params.get('chatId'));
    }
  })();

  setupAuth(async (user) => {
    if (user) {
      try {
        const profile = await getUserProfile(user.uid);
        
        if (profile && profile.phoneNumber) {
          myProfileData = profile;
          settingsName.textContent = user.displayName || profile.displayName || 'Me';
          settingsAvatar.src = profile.customPhotoURL || DEFAULT_AVATAR;
          settingsPhone.textContent = profile.phoneNumber;
          if (settingsBio) settingsBio.textContent = profile.bio || '';
          
          if (profile.privacyPicture === 'contacts') {
             radioPrivacyContacts.checked = true;
          } else {
             radioPrivacyEverybody.checked = true;
          }

          // Force update local metadata if Google name/photo is newer but missing in profile
          if (!profile.displayName || !profile.photoURL) {
             await saveUserProfile(user.uid, profile.phoneNumber, profile.customPhotoURL, profile.privacyPicture);
          }

          switchScreen(dashboardScreen);

          // Initialise header UI for the default active tab (Chats)
          const initFilterBar = document.getElementById('chat-filters');
          const initSearchBar = document.getElementById('chat-search-bar');
          const initDashMenu  = document.getElementById('btn-dashboard-menu');
          const initSelCalls  = document.getElementById('btn-select-calls');
          if (initFilterBar) initFilterBar.classList.remove('hidden');
          if (initSearchBar) initSearchBar.classList.remove('hidden');
          if (initDashMenu)  initDashMenu.classList.remove('hidden');
          if (initSelCalls)  initSelCalls.classList.add('hidden');
          
          // Listen to recent chats uniquely
          if (recentChatsUnsubscribe) recentChatsUnsubscribe();
          recentChatsUnsubscribe = listenToRecentChats(renderRecentChats);
          renderContactsTab();
          updateUserPresence('online');
          requestNotificationPermission();

          // ── Pusher Beams: register this device for push notifications ─────
          initBeams(user.uid,
            (deviceId) => console.log('[Beams] Device registered:', deviceId),
            (err) => console.warn('[Beams] Could not start push notifications:', err)
          );

          // Setup Global Call Listener
          // Store the unsubscribe so it can be cleaned up on logout
          if (callListenerUnsubscribe) callListenerUnsubscribe();
          callListenerUnsubscribe = listenForIncomingCalls(user.uid, async (chatId, callData) => { 
              // Don't ring if we're ALREADY in an active call
              if (currentActiveCallId) return;

              currentRingingChatId = chatId;
              const reqUser = await getUserProfile(callData.callerId);
              incomingCallName.textContent = reqUser?.displayName || 'Unknown';
              incomingCallAvatar.src = reqUser?.customPhotoURL || DEFAULT_AVATAR;
              incomingCallType.textContent = callData.isVideoCall ? 'Incoming Video Call...' : 'Incoming Voice Call...';
              currentCallIsVideo = callData.isVideoCall;
              incomingCallModal.classList.remove('hidden');
              ringtoneAudio.currentTime = 0;
              ringtoneAudio.play().catch(e => console.warn("Autoplay blocked", e));
              
              // Background Notify if hidden
              showLocalNotification("Incoming Call", `Incoming call from ${reqUser?.displayName || 'Someone'}`);
          }, (chatId, callData) => { 
              if (callData.status !== 'ringing') {
                  incomingCallModal.classList.add('hidden');
                  ringtoneAudio.pause();
                  ringtoneAudio.currentTime = 0;
                  if (currentRingingChatId === chatId) currentRingingChatId = null;
                  if (currentActiveCallId === chatId && callData.status === 'ended') {
                      currentActiveCallId = null;
                      // Also hide the call screen if remote ended the call
                      activeCallScreen.classList.add('hidden');
                      document.getElementById('pip-call-bubble')?.classList.add('hidden');
                  }
              }
          });
        } else {
          // No phone number found - show profile setup
          switchScreen(profileScreen);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        switchScreen(loginScreen);
      }
    } else {
      currentChatId = null;
      currentOtherUser = null;
      myProfileData = null;
      if (currentChatUnsubscribe) currentChatUnsubscribe();
      if (currentTypingUnsubscribe) currentTypingUnsubscribe();
      if (currentPresenceUnsubscribe) currentPresenceUnsubscribe();
      if (recentChatsUnsubscribe) recentChatsUnsubscribe();
      if (callListenerUnsubscribe) { callListenerUnsubscribe(); callListenerUnsubscribe = null; }
      switchScreen(loginScreen);
    }
  });

  // Global Presence Listeners
  window.addEventListener('focus', () => updateUserPresence('online'));
  window.addEventListener('blur', () => updateUserPresence('offline'));
  window.addEventListener('beforeunload', () => updateUserPresence('offline'));

  // Admin Event Listeners (Modals and Menus)
  btnChatOptions.addEventListener('click', (e) => {
     chatOptionsMenu.classList.toggle('hidden');
     e.stopPropagation();
  });
  
  // Custom Modals & Taps to Close
  document.addEventListener('click', (e) => {
     if (!btnChatOptions.contains(e.target) && !chatOptionsMenu.contains(e.target)) {
        chatOptionsMenu.classList.add('hidden');
     }
     
     // Close bottom sheet if tapping outside modal box
     if (e.target === msgActionMenu) {
        msgActionMenu.classList.add('hidden');
     }
  });

  // ─── Contact Profile Screen ────────────────────────────────────────
  let cpPresenceUnsubscribe = null; // separate live status listener for profile screen

  function openContactProfile() {
    if (!currentOtherUser) return;
    const user = currentOtherUser;
    const avatarSrc = user.privacyAvatar || user.customPhotoURL || DEFAULT_AVATAR;
    const alias = chatUserNameEl.textContent || user.displayName || 'Unknown';

    // Hero image + blurred background
    cpAvatar.src  = avatarSrc;
    cpBgImg.src   = avatarSrc;
    cpName.textContent = alias;

    // Status
    const statusTxt = chatUserStatusEl.textContent || 'offline';
    cpStatusText.textContent = statusTxt;
    if (statusTxt.toLowerCase().includes('online')) {
      cpStatusDot.classList.add('online');
    } else {
      cpStatusDot.classList.remove('online');
    }

    // Bio
    const bio = user.bio || '';
    if (bio) {
      cpBio.textContent = bio;
      if (cpBioCard) cpBioCard.style.display = '';
    } else {
      cpBio.textContent = 'Hey there! I am using Chatify.';
      if (cpBioCard) cpBioCard.style.display = '';
    }

    // Phone
    cpPhone.textContent = user.phoneNumber || 'Hidden';

    // Email / Google account
    if (user.email) {
      cpEmail.textContent = user.email;
      if (cpEmailCard) cpEmailCard.style.display = '';
    } else {
      if (cpEmailCard) cpEmailCard.style.display = 'none';
    }

    // Block label
    const isBlocked = myProfileData?.blockedUsers?.includes(user.uid);
    if (cpBlockLabel) cpBlockLabel.textContent = isBlocked ? 'Unblock Contact' : 'Block Contact';
    const cpBlockBtn = document.getElementById('cp-btn-block');
    if (cpBlockBtn) cpBlockBtn.style.color = isBlocked ? '#94a3b8' : '';

    // Show screen
    contactProfileScreen.classList.remove('hidden');

    // Live presence listener
    if (cpPresenceUnsubscribe) cpPresenceUnsubscribe();
    cpPresenceUnsubscribe = listenToPresence(user.uid, (status, lastActive) => {
      const isOnline = status === 'online';
      if (cpStatusDot) cpStatusDot.classList.toggle('online', isOnline);
      if (cpStatusText) {
        if (isOnline) {
          cpStatusText.textContent = 'Online';
        } else {
          cpStatusText.textContent = lastActive ? formatLastSeen(lastActive.toDate()) : 'Offline';
        }
      }
    });
  }

  function closeContactProfile() {
    contactProfileScreen.classList.add('hidden');
    if (cpPresenceUnsubscribe) { cpPresenceUnsubscribe(); cpPresenceUnsubscribe = null; }
  }

  // Open on avatar / header tap
  if (chatUserAvatarEl) chatUserAvatarEl.addEventListener('click', openContactProfile);
  if (chatHeaderInfo)   chatHeaderInfo.addEventListener('click', openContactProfile);

  // Close
  if (btnCloseContactProfile) btnCloseContactProfile.addEventListener('click', closeContactProfile);

  // Avatar lightbox
  const cpAvatarWrap = document.getElementById('cp-avatar-wrap');
  if (cpAvatarWrap && imageLightbox) {
    cpAvatarWrap.addEventListener('click', () => {
      const src = cpAvatar.src;
      if (!src || src === window.location.href) return;
      lightboxImage.src = src;
      lightboxDownloadLink.href = src;
      imageLightbox.classList.remove('hidden');
    });
  }

  // Quick action: Message (just close profile and stay in chat)
  const cpBtnMessage = document.getElementById('cp-btn-message');
  if (cpBtnMessage) cpBtnMessage.addEventListener('click', closeContactProfile);

  // Quick action: Audio Call
  const cpBtnAudio = document.getElementById('cp-btn-audio');
  if (cpBtnAudio) cpBtnAudio.addEventListener('click', () => {
    closeContactProfile();
    const audioBtn = document.getElementById('btn-dial-audio');
    if (audioBtn && !audioBtn.classList.contains('hidden')) audioBtn.click();
  });

  // Quick action: Video Call
  const cpBtnVideo = document.getElementById('cp-btn-video');
  if (cpBtnVideo) cpBtnVideo.addEventListener('click', () => {
    closeContactProfile();
    const videoBtn = document.getElementById('btn-dial-video');
    if (videoBtn && !videoBtn.classList.contains('hidden')) videoBtn.click();
  });

  // Quick action: Search (scrolls to top of messages / future search)
  const cpBtnSearch = document.getElementById('cp-btn-search-chat');
  if (cpBtnSearch) cpBtnSearch.addEventListener('click', () => {
    closeContactProfile();
    // Focus message input as a basic affordance
    if (inputMessage) inputMessage.focus();
  });

  // Block / Unblock from profile screen
  const cpBtnBlockEl = document.getElementById('cp-btn-block');
  if (cpBtnBlockEl) {
    cpBtnBlockEl.addEventListener('click', async () => {
      if (!auth.currentUser || !currentOtherUser) return;
      const isBlocked = myProfileData?.blockedUsers?.includes(currentOtherUser.uid);
      cpBtnBlockEl.innerHTML = `<i class='bx bx-loader bx-spin'></i> <span>${isBlocked ? 'Unblocking...' : 'Blocking...'}</span>`;
      await toggleBlockUser(auth.currentUser.uid, currentOtherUser.uid, !isBlocked);
      const freshProfile = await getUserProfile(auth.currentUser.uid);
      myProfileData = freshProfile;
      closeContactProfile();
      startChat(currentOtherUser);
    });
  }

  // Message Options Handlers
  btnMsgDelete.addEventListener('click', () => {
      msgActionMenu.classList.add('hidden');
      currentAction = 'delete-msg';
      modalTitle.textContent = "Delete Message?";
      actionModal.classList.remove('hidden');
  });

  // Pin / Unpin Message
  if (btnMsgPin) {
    btnMsgPin.addEventListener('click', async () => {
      msgActionMenu.classList.add('hidden');
      if (!currentMessageActionContext || !currentChatId) return;
      const alreadyPinned = currentPinnedMsgId && currentMessageActionContext.msgId === currentPinnedMsgId;
      if (alreadyPinned) {
        await unpinMessage(currentChatId);
      } else {
        await pinMessage(currentChatId, currentMessageActionContext);
      }
    });
  }

  // Delete for Me (removes the "deleted" placeholder from your view)
  if (btnMsgDeleteForMe) {
    btnMsgDeleteForMe.addEventListener('click', async () => {
      msgActionMenu.classList.add('hidden');
      if (!currentMessageActionContext || !currentChatId) return;
      await deleteSingleMessage(currentChatId, currentMessageActionContext.msgId, 'me');
    });
  }

  // Pinned Message Banner — click scrolls to the pinned message
  if (pinnedMessageBanner) {
    pinnedMessageBanner.addEventListener('click', (e) => {
      if (e.target.closest('#btn-unpin-msg')) return; // handled by unpin
      if (!currentPinnedMsgId) return;
      const pinnedEl = messagesContainer.querySelector('[data-msgid="' + currentPinnedMsgId + '"]');
      if (pinnedEl) {
        pinnedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight flash
        pinnedEl.style.transition = 'background 0.3s';
        pinnedEl.style.background = 'rgba(99,102,241,0.25)';
        setTimeout(() => { pinnedEl.style.background = ''; }, 1200);
      }
    });
  }

  if (btnUnpinMsg) {
    btnUnpinMsg.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (currentChatId) await unpinMessage(currentChatId);
    });
  }

  btnMsgReply.addEventListener('click', () => {
      msgActionMenu.classList.add('hidden');
      currentReplyContext = {
          msgId: currentMessageActionContext.msgId,
          senderName: currentMessageActionContext.senderName,
          textSnippet: currentMessageActionContext.text || (currentMessageActionContext.imageUrl ? 'Photo' : 'Voice Message')
      };
      replyPreviewName.textContent = currentReplyContext.senderName;
      replyPreviewText.textContent = currentReplyContext.textSnippet;
      replyPreviewContainer.classList.remove('hidden');
      inputMessage.focus();
  });

  btnMsgEdit.addEventListener('click', async () => {
      msgActionMenu.classList.add('hidden');
      const newText = await showPromptModal("Edit Message", "Update your message:", currentMessageActionContext.text);
      if (newText !== null && newText.trim() !== '' && newText !== currentMessageActionContext.text) {
          await editMessage(currentChatId, currentMessageActionContext.msgId, newText);
      }
  });

  btnCancelReply.addEventListener('click', () => {
      currentReplyContext = null;
      replyPreviewContainer.classList.add('hidden');
  });
  
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      btn.classList.add('active');

      tabContents.forEach(content => {
        if (content.id === `${tab}-tab`) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });

      // --- Per-tab header UI visibility ---
      const filterBar      = document.getElementById('chat-filters');
      const searchBar      = document.getElementById('chat-search-bar');
      const btnSelectCalls = document.getElementById('btn-select-calls');
      const btnDashMenu    = document.getElementById('btn-dashboard-menu');

      // Filter bar + search: Chats only
      if (filterBar)      filterBar.classList.toggle('hidden', tab !== 'chats');
      if (searchBar)      searchBar.classList.toggle('hidden', tab !== 'chats');
      // ⋮ menu: Chats only
      if (btnDashMenu)    btnDashMenu.classList.toggle('hidden', tab !== 'chats');
      // ☑️ select-calls: Calls only
      if (btnSelectCalls) btnSelectCalls.classList.toggle('hidden', tab !== 'calls');

      // Clear search when leaving Chats tab
      if (tab !== 'chats' && currentSearchQuery) {
          currentSearchQuery = '';
          const sInput = document.getElementById('input-chat-search');
          const cBtn   = document.getElementById('btn-clear-chat-search');
          if (sInput) sInput.value = '';
          if (cBtn)   cBtn.classList.add('hidden');
      }

      if (tab === 'chats') {
          hubTitle.textContent = currentInboxMode === 'locked' ? 'Locked Chats' : 'Chats';
          renderRecentChats(currentRecentChats);
      } else if (tab === 'calls') {
          hubTitle.textContent = 'Calls';
          // Reset call select mode when switching to calls tab
          isCallSelectMode = false;
          selectedCallLogs = [];
          const bar = document.getElementById('calls-selection-bar');
          if (bar) bar.classList.add('hidden');
          renderCallsTab();
      } else if (tab === 'contacts') {
          hubTitle.textContent = 'Find';
      } else if (tab === 'settings') {
          hubTitle.textContent = 'Settings';
      }
    });
  });
  
  function showToast(msg) {
      toastNotification.textContent = msg;
      toastNotification.classList.remove('hidden');
      setTimeout(() => toastNotification.classList.add('hidden'), 2500);
  }

  btnMsgForward.addEventListener('click', () => {
      msgActionMenu.classList.add('hidden');
      forwardList.innerHTML = '';
      
      if (!myProfileData || !myProfileData.contacts) return;
      myProfileData.contacts.forEach(async uid => {
         const contact = await getUserProfile(uid);
         if(!contact) return;
         const aliasName = myProfileData?.contactNames?.[contact.uid] || contact.displayName;
         const avatar = getDisplayAvatar(contact);
         
         const card = document.createElement('div');
         card.className = 'recent-chat-item';
         card.innerHTML = `
           <img src="${avatar}" class="rc-avatar" />
           <div class="rc-content">
             <div class="rc-top"><span class="rc-name">${aliasName}</span></div>
           </div>
         `;
         card.addEventListener('click', async () => {
             forwardModal.classList.add('hidden');
             const targetChatId = [auth.currentUser.uid, contact.uid].sort().join('_');
             await sendMessage(targetChatId, { uid: contact.uid, ...contact }, currentMessageActionContext.text, currentMessageActionContext.imageUrl, currentMessageActionContext.audioUrl);
             showToast('Forwarded!');
         });
         forwardList.appendChild(card);
      });
      forwardModal.classList.remove('hidden');
  });

  btnCloseForward.addEventListener('click', () => forwardModal.classList.add('hidden'));

  btnMsgCopy.addEventListener('click', () => {
      msgActionMenu.classList.add('hidden');
      if (currentMessageActionContext.text) {
          navigator.clipboard.writeText(currentMessageActionContext.text).then(() => {
              showToast('Copied to clipboard');
          });
      }
  });

  emojiBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
          msgActionMenu.classList.add('hidden');
          const emoji = btn.textContent;
          if (currentMessageActionContext.myReaction === emoji) {
              await removeReaction(currentChatId, currentMessageActionContext.msgId);
          } else {
              await reactToMessage(currentChatId, currentMessageActionContext.msgId, emoji);
          }
      });
  });

  btnMsgDownload.addEventListener('click', async () => {
      msgActionMenu.classList.add('hidden');
      if(currentMessageActionContext.imageUrl) {
         try {
            const response = await fetch(currentMessageActionContext.imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `Chatify_Image_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
         } catch(err) {
            console.error('Image download blocked by strict CORS policies on ImgBB:', err);
            // Fallback for CORS restriction: just open in new tab
            window.open(currentMessageActionContext.imageUrl, '_blank');
         }
      }
  });

  btnClearChat.addEventListener('click', () => {
      currentAction = 'clear';
      modalTitle.textContent = "Clear Chat History?";
      actionModal.classList.remove('hidden');
      chatOptionsMenu.classList.add('hidden');
  });

  btnDeleteChat.addEventListener('click', () => {
      currentAction = 'delete';
      modalTitle.textContent = "Delete Entire Chat?";
      actionModal.classList.remove('hidden');
      chatOptionsMenu.classList.add('hidden');
  });

  btnModalCancel.addEventListener('click', () => actionModal.classList.add('hidden'));

  btnModalMe.addEventListener('click', async () => {
      actionModal.classList.add('hidden');
      if(currentAction === 'clear') await clearChat(currentChatId, 'me');
      if(currentAction === 'delete') {
           await deleteChat(currentChatId, 'me');
           btnBackDashboard.click(); 
      }
      if(currentAction === 'delete-msg') {
           await deleteSingleMessage(currentChatId, currentMessageActionContext.msgId, 'me');
      }
  });

  btnModalEveryone.addEventListener('click', async () => {
      actionModal.classList.add('hidden');
      if(currentAction === 'clear') await clearChat(currentChatId, 'everyone');
      if(currentAction === 'delete') {
           await deleteChat(currentChatId, 'everyone');
           btnBackDashboard.click(); 
      }
      if(currentAction === 'delete-msg') {
           await deleteSingleMessage(currentChatId, currentMessageActionContext.msgId, 'everyone');
      }
  });

  btnToggleDisappearing.addEventListener('click', async () => {
      chatOptionsMenu.classList.add('hidden');
      const isCurrentlyOn = !disappearingBanner.classList.contains('hidden');
      await toggleDisappearing(currentChatId, !isCurrentlyOn);
  });

  const handleBlockToggle = async () => {
     if (!auth.currentUser || !currentOtherUser) return;
     const isCurrentlyBlocked = myProfileData?.blockedUsers?.includes(currentOtherUser.uid);
     
     btnBlockUser.innerHTML = `<i class='bx bx-loader bx-spin'></i>`;
     await toggleBlockUser(auth.currentUser.uid, currentOtherUser.uid, !isCurrentlyBlocked);
     
     const freshProfile = await getUserProfile(auth.currentUser.uid);
     myProfileData = freshProfile;
     chatOptionsMenu.classList.add('hidden');
     startChat(currentOtherUser); // refresh UI
  };
  btnBlockUser.addEventListener('click', handleBlockToggle);
  btnUnblockBanner.addEventListener('click', handleBlockToggle);

  btnLockChat.addEventListener('click', async () => {
     if (!auth.currentUser || !currentChatId) return;
     const isCurrentlyLocked = myProfileData?.lockedChats?.includes(currentChatId);
     
     if (!isCurrentlyLocked) {
         if (!myProfileData.chatLockCode) {
             const newCode = await showPromptModal("Setup Chat Lock", "Create a Secret Code to hide and protect your locked chats (e.g. '0000' or 'secret').", "");
             if (!newCode || newCode.trim() === "") {
                 chatOptionsMenu.classList.add('hidden');
                 return;
             }
             await setChatLockCode(auth.currentUser.uid, newCode.trim());
             myProfileData.chatLockCode = newCode.trim();
         }
         await toggleChatLock(auth.currentUser.uid, currentChatId, true);
     } else {
         await toggleChatLock(auth.currentUser.uid, currentChatId, false);
     }
     
     const freshProfile = await getUserProfile(auth.currentUser.uid);
     myProfileData = freshProfile;
     chatOptionsMenu.classList.add('hidden');
     startChat(currentOtherUser); // refresh UI
     
     // Update cache and background list if we leave
     renderRecentChats(currentRecentChats);
  });

  // Call System Interactions
  const btnCallMute = document.getElementById('btn-call-mute');
  const btnCallVideo = document.getElementById('btn-call-video');
  const btnCallSwapCam = document.getElementById('btn-call-swap-cam');
  const btnCallEnd = document.getElementById('btn-call-end');
  const btnCallMinimize = document.getElementById('btn-call-minimize');
  const pipCallBubble = document.getElementById('pip-call-bubble');

  const btnAcceptUpgrade = document.getElementById('btn-accept-upgrade');
  const btnRejectUpgrade = document.getElementById('btn-reject-upgrade');
  const videoUpgradeModal = document.getElementById('video-upgrade-modal');
  
  if (btnAcceptUpgrade) {
      btnAcceptUpgrade.addEventListener('click', async () => {
          videoUpgradeModal.classList.add('hidden');
          await acceptVideoUpgrade(currentActiveCallId, document.getElementById('localVideo'));
          currentCallIsVideo = true;
          const avatarEl = document.getElementById('audio-call-avatar-container');
          if(avatarEl) avatarEl.classList.add('hidden');
      });
  }
  
  if (btnRejectUpgrade) {
      btnRejectUpgrade.addEventListener('click', () => {
          videoUpgradeModal.classList.add('hidden');
          rejectVideoUpgrade(currentActiveCallId);
      });
  }

  let isCallMuted = false;
  let isVideoPaused = false;

  if(btnDialVideo) btnDialVideo.addEventListener('click', async () => {
    if (!currentChatId || !currentOtherUser) return;
    activeCallScreen.classList.remove('hidden');
    btnCallSwapCam.classList.remove('hidden');
    const avatarEl = document.getElementById('audio-call-avatar-container');
    if(avatarEl) avatarEl.classList.add('hidden');
    activeCallName.textContent = currentOtherUser.displayName || 'Friend';
    activeCallDuration.textContent = 'Calling...';
    currentActiveCallId = currentChatId;
    currentCallIsVideo = true;
    try {
       // Check if recipient is online → show Ringing vs Calling
       checkCalleeStatus(currentOtherUser.uid);
       await startCall(currentChatId, auth.currentUser.uid, currentOtherUser.uid, true, localVideo, remoteVideo);
    } catch(err) {
       activeCallScreen.classList.add('hidden');
       currentActiveCallId = null;
    }
  });

  if(btnDialAudio) btnDialAudio.addEventListener('click', async () => {
    if (!currentChatId || !currentOtherUser) return;
    activeCallScreen.classList.remove('hidden');
    btnCallSwapCam.classList.add('hidden');

    // Show avatar for audio calls
    const avatarEl = document.getElementById('audio-call-avatar-container');
    const imgEl = document.getElementById('active-call-avatar');
    if(avatarEl && imgEl) {
        avatarEl.classList.remove('hidden');
        imgEl.src = currentOtherUser.customPhotoURL || DEFAULT_AVATAR;
    }

    activeCallName.textContent = currentOtherUser.displayName || 'Friend';
    activeCallDuration.textContent = 'Calling...';
    currentActiveCallId = currentChatId;
    currentCallIsVideo = false;
    try {
       // Check if recipient is online → show Ringing vs Calling
       checkCalleeStatus(currentOtherUser.uid);
       await startCall(currentChatId, auth.currentUser.uid, currentOtherUser.uid, false, localVideo, remoteVideo);
    } catch(err) {
       activeCallScreen.classList.add('hidden');
       currentActiveCallId = null;
    }
  });

  if(btnCallMute) btnCallMute.addEventListener('click', () => {
      isCallMuted = !toggleAudio();
      btnCallMute.innerHTML = isCallMuted ? "<i class='bx bx-microphone-off'></i>" : "<i class='bx bx-microphone'></i>";
      btnCallMute.style.color = isCallMuted ? "#ef4444" : "white";
  });

  if(btnCallVideo) btnCallVideo.addEventListener('click', () => {
      // If it's pure audio call, trigger upgrade logic!
      if (!currentCallIsVideo && localStream && localStream.getVideoTracks().length === 0) {
          requestVideoUpgrade(currentActiveCallId, localVideo);
          return;
      }
      
      // Standard video toggle
      isVideoPaused = !toggleVideo();
      btnCallVideo.innerHTML = isVideoPaused ? "<i class='bx bx-video-off'></i>" : "<i class='bx bx-video'></i>";
      btnCallVideo.style.color = isVideoPaused ? "#ef4444" : "white";
  });

  if (btnCallSwapCam) btnCallSwapCam.addEventListener('click', () => {
      swapCamera(localVideo);
  });

  // Lightbox Close Logic
  if (lightboxClose) lightboxClose.addEventListener('click', () => {
      if(imageLightbox) imageLightbox.classList.add('hidden');
  });
  if (imageLightbox) imageLightbox.addEventListener('click', (e) => {
      if(e.target === imageLightbox) imageLightbox.classList.add('hidden');
  });

  const executeEndCall = async () => {
      const targetId = currentActiveCallId || currentChatId || currentRingingChatId;
      if (targetId) {
         await endCall(targetId);
      }
      activeCallScreen.classList.add('hidden');
      pipCallBubble.classList.add('hidden');
      currentActiveCallId = null;
  };

  if(btnCallEnd) btnCallEnd.addEventListener('click', executeEndCall);
  if(btnDeclineCall) btnDeclineCall.addEventListener('click', () => {
      ringtoneAudio.pause();
      if(currentRingingChatId) rejectCall(currentRingingChatId);
      incomingCallModal.classList.add('hidden');
  });

  if(btnAcceptCall) btnAcceptCall.addEventListener('click', async () => {
      if (!currentRingingChatId) return;
      ringtoneAudio.pause();
      currentActiveCallId = currentRingingChatId;
      const cachedRingId = currentRingingChatId;
      
      const avatarEl = document.getElementById('audio-call-avatar-container');
      const imgEl = document.getElementById('active-call-avatar');
      
      if(currentCallIsVideo) {
          btnCallSwapCam.classList.remove('hidden');
          if(avatarEl) avatarEl.classList.add('hidden');
      } else {
          btnCallSwapCam.classList.add('hidden');
          if(avatarEl && imgEl) {
              avatarEl.classList.remove('hidden');
              imgEl.src = document.getElementById('incoming-call-avatar').src;
          }
      }

      incomingCallModal.classList.add('hidden');
      activeCallScreen.classList.remove('hidden');
      activeCallName.textContent = incomingCallName.textContent;
      activeCallDuration.textContent = 'Connecting...';
      try {
          await answerCall(cachedRingId, localVideo, remoteVideo);
      } catch(err) {
          activeCallScreen.classList.add('hidden');
          currentActiveCallId = null;
      }
  });

  // Minimize (PiP) Logic
  if (btnCallMinimize) btnCallMinimize.addEventListener('click', () => {
       activeCallScreen.classList.add('hidden');
       pipCallBubble.classList.remove('hidden');
  });

  if (pipCallBubble) pipCallBubble.addEventListener('click', () => {
       pipCallBubble.classList.add('hidden');
       activeCallScreen.classList.remove('hidden');
  });

  // Upgrade Accept/Reject Handlers
  if (btnAcceptUpgrade) btnAcceptUpgrade.addEventListener('click', async () => {
      videoUpgradeModal.classList.add('hidden');
      await acceptVideoUpgrade(currentActiveCallId, localVideo);
      currentCallIsVideo = true;
  });

  if (btnRejectUpgrade) btnRejectUpgrade.addEventListener('click', async () => {
      videoUpgradeModal.classList.add('hidden');
      await rejectVideoUpgrade(currentActiveCallId);
  });

  // Profile Save
  btnSaveProfile.addEventListener('click', async () => {
    const phone = inputMyPhone.value.trim();
    if (phone) {
      const uid = auth.currentUser.uid;
      let photoUrlToSave = null;
      if (selectedAvatarFile) {
         const spinner = document.getElementById('setup-avatar-spinner');
         if(spinner) spinner.classList.remove('hidden');
         
         btnSaveProfile.innerHTML = "<i class='bx bx-loader bx-spin'></i> Uploading...";
         const result = await uploadToImgBB(selectedAvatarFile);
         if (result && result.url) photoUrlToSave = result.url;
         
         if(spinner) spinner.classList.add('hidden');
      }

      await saveUserProfile(uid, phone, photoUrlToSave, 'everybody');
      const profile = await getUserProfile(uid);
      myProfileData = profile;
      
      settingsName.textContent = auth.currentUser.displayName;
      settingsAvatar.src = profile.customPhotoURL || DEFAULT_AVATAR;
      settingsPhone.textContent = profile.phoneNumber;
      
      radioPrivacyEverybody.checked = true;

      switchScreen(dashboardScreen);
      if (recentChatsUnsubscribe) recentChatsUnsubscribe();
      recentChatsUnsubscribe = listenToRecentChats(renderRecentChats);
      renderContactsTab();
      updateUserPresence('online');
    }
  });

  // User Search & Add Contacts
  btnSearchUser.addEventListener('click', async () => {
    const phone = inputSearchPhone.value.trim();
    if (!phone) return;

    // Check Secret Code Chat Lock
    if (myProfileData && myProfileData.chatLockCode && phone === myProfileData.chatLockCode) {
        inputSearchPhone.value = '';
        currentInboxMode = 'locked';
        hubTitle.innerHTML = "<i class='bx bx-lock-open-alt' style='color:#10b981; margin-right:5px;'></i> Locked Chats";
        
        navItems.forEach(n => n.classList.remove('active'));
        navItems[0].classList.add('active'); // Activate Chats tab
        
        tabContents.forEach(content => {
          if (content.id === 'chats-tab') content.classList.remove('hidden');
          else content.classList.add('hidden');
        });
        
        renderRecentChats(currentRecentChats);
        return;
    }

    searchResultsContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem;">Searching...</p>';
    const results = await searchUserByPhone(phone);
    
    searchResultsContainer.innerHTML = '';
    
    if (results.length === 0) {
      searchResultsContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.9rem;">No user found.</p>';
      return;
    }

    results.forEach(res => {
      if (res.uid === auth.currentUser.uid) return;
      
      const isFriend = myProfileData.contacts && myProfileData.contacts.includes(res.uid);
      const displayAvatar = getDisplayAvatar(res);
      const aliasName = myProfileData?.contactNames?.[res.uid] || res.displayName;

      const div = document.createElement('div');
      div.className = 'user-card';
      let actionBtn = '';
      if (isFriend) {
          actionBtn = `<button class="icon-btn-primary start-chat-btn" title="Chat" style="background:#6366f1;"><i class='bx bx-message-rounded-dots'></i></button>`;
      } else {
          actionBtn = `<button class="icon-btn-primary add-friend-btn" title="Add Contact" style="background:#10b981;"><i class='bx bx-user-plus'></i></button>`;
      }

      div.innerHTML = `
        <div class="info">
          <img src="${displayAvatar}" alt="User Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" />
          <div class="details">
            <span class="name" style="font-size: 0.95rem;">${aliasName}</span>
            <span class="phone" style="font-size: 0.75rem;">${res.phoneNumber}</span>
          </div>
        </div>
        ${actionBtn}
      `;

      if (isFriend) {
          div.querySelector('.start-chat-btn').addEventListener('click', () => {
             startChat({...res, privacyAvatar: displayAvatar});
          });
      } else {
          div.querySelector('.add-friend-btn').addEventListener('click', async () => {
             const customName = await showPromptModal("Save Contact", "Enter a name for this contact:", res.displayName);
             if (customName === null) return; // Cancelled
             
             div.querySelector('.add-friend-btn').innerHTML = `<i class='bx bx-loader bx-spin'></i>`;
             await addContact(auth.currentUser.uid, res.uid, customName);
             const freshProfile = await getUserProfile(auth.currentUser.uid);
             myProfileData = freshProfile;
             
             const freshAlias = myProfileData?.contactNames?.[res.uid] || customName || res.displayName;
             
             div.innerHTML = `
                <div class="info">
                   <img src="${displayAvatar}" alt="User Avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" />
                   <div class="details">
                      <span class="name" style="font-size: 0.95rem;">${freshAlias}</span>
                      <span class="phone" style="font-size: 0.75rem;">${res.phoneNumber}</span>
                   </div>
                </div>
                <button class="icon-btn-primary start-chat-btn" title="Chat" style="background:#6366f1;"><i class='bx bx-message-rounded-dots'></i></button>
             `;
             div.querySelector('.start-chat-btn').addEventListener('click', () => {
                 startChat({...res, privacyAvatar: displayAvatar});
             });
             renderContactsTab();
          });
      }

      searchResultsContainer.appendChild(div);
    });
  });

  btnLogout.addEventListener('click', async () => {
    updateUserPresence('offline');
    await stopBeams(); // Unregister push device on logout
    await logoutUser();
  });

  // ─── Edit Profile ─────────────────────────────────────────────────
  const editProfileModal   = document.getElementById('edit-profile-modal');
  const editProfileName    = document.getElementById('edit-profile-name');
  const editProfilePhone   = document.getElementById('edit-profile-phone');
  const editProfileBio     = document.getElementById('edit-profile-bio');
  const editBioCount       = document.getElementById('edit-bio-count');
  const btnEditProfile     = document.getElementById('btn-edit-profile');
  const btnCloseEditProfile = document.getElementById('btn-close-edit-profile');
  const btnEditProfileCancel = document.getElementById('btn-edit-profile-cancel');
  const btnEditProfileSave = document.getElementById('btn-edit-profile-save');

  function openEditProfileModal() {
    if (!myProfileData) return;
    editProfileName.value  = myProfileData.displayName  || auth.currentUser?.displayName || '';
    editProfilePhone.value = myProfileData.phoneNumber || '';
    editProfileBio.value   = myProfileData.bio || '';
    if (editBioCount) editBioCount.textContent = (myProfileData.bio || '').length;
    editProfileModal.classList.remove('hidden');
    setTimeout(() => editProfileName.focus(), 150);
  }

  function closeEditProfileModal() {
    editProfileModal.classList.add('hidden');
  }

  if (btnEditProfile)     btnEditProfile.addEventListener('click', openEditProfileModal);
  if (btnCloseEditProfile) btnCloseEditProfile.addEventListener('click', closeEditProfileModal);
  if (btnEditProfileCancel) btnEditProfileCancel.addEventListener('click', closeEditProfileModal);

  // Tap outside to close
  if (editProfileModal) editProfileModal.addEventListener('click', (e) => {
    if (e.target === editProfileModal) closeEditProfileModal();
  });

  // Bio character counter
  if (editProfileBio) editProfileBio.addEventListener('input', () => {
    if (editBioCount) editBioCount.textContent = editProfileBio.value.length;
  });

  if (btnEditProfileSave) {
    btnEditProfileSave.addEventListener('click', async () => {
      if (!auth.currentUser) return;
      const newName  = editProfileName.value.trim();
      const newPhone = editProfilePhone.value.trim();
      const newBio   = editProfileBio.value.trim();

      if (!newName) { editProfileName.focus(); return; }
      if (!newPhone) { editProfilePhone.focus(); return; }

      btnEditProfileSave.innerHTML = "<i class='bx bx-loader bx-spin'></i> Saving...";
      btnEditProfileSave.disabled = true;

      try {
        const uid = auth.currentUser.uid;
        // Update phone + bio via saveUserProfile (handles all fields)
        await saveUserProfile(uid, newPhone, myProfileData?.customPhotoURL || null, myProfileData?.privacyPicture || 'everybody');
        // Update name + bio separately
        await updateUserProfile(uid, { displayName: newName, bio: newBio });

        const freshProfile = await getUserProfile(uid);
        myProfileData = freshProfile;

        settingsName.textContent  = newName;
        settingsPhone.textContent = newPhone;
        if (settingsBio) settingsBio.textContent = newBio;

        closeEditProfileModal();
        showToast('Profile updated!');
      } catch (err) {
        console.error('Profile update failed:', err);
        showToast('Update failed. Try again.');
      } finally {
        btnEditProfileSave.innerHTML = "<i class='bx bx-check'></i> Save Changes";
        btnEditProfileSave.disabled = false;
      }
    });
  }

  // ─── Delete Account ───────────────────────────────────────────────
  const deleteAccountModal   = document.getElementById('delete-account-modal');
  const btnDeleteAccount     = document.getElementById('btn-delete-account');
  const btnDeleteAccountCancel  = document.getElementById('btn-delete-account-cancel');
  const btnDeleteAccountConfirm = document.getElementById('btn-delete-account-confirm');

  if (btnDeleteAccount) btnDeleteAccount.addEventListener('click', () => {
    if (deleteAccountModal) deleteAccountModal.classList.remove('hidden');
  });

  if (btnDeleteAccountCancel) btnDeleteAccountCancel.addEventListener('click', () => {
    if (deleteAccountModal) deleteAccountModal.classList.add('hidden');
  });

  if (deleteAccountModal) deleteAccountModal.addEventListener('click', (e) => {
    if (e.target === deleteAccountModal) deleteAccountModal.classList.add('hidden');
  });

  if (btnDeleteAccountConfirm) {
    btnDeleteAccountConfirm.addEventListener('click', async () => {
      btnDeleteAccountConfirm.innerHTML = "<i class='bx bx-loader bx-spin'></i> Deleting...";
      btnDeleteAccountConfirm.disabled = true;
      try {
        updateUserPresence('offline');
        await deleteUserAccount(); // re-authenticates + deletes auth + firestore doc
        // Auth state listener will fire and redirect to login
      } catch (err) {
        console.error('Delete account failed:', err);
        showToast('Could not delete account. Please try again.');
        btnDeleteAccountConfirm.innerHTML = "<i class='bx bx-trash'></i> Yes, Delete";
        btnDeleteAccountConfirm.disabled = false;
      }
    });
  }

  if (btnBackDashboard) btnBackDashboard.addEventListener('click', () => {
    // Close contact profile if open
    if (contactProfileScreen && !contactProfileScreen.classList.contains('hidden')) {
      contactProfileScreen.classList.add('hidden');
      if (cpPresenceUnsubscribe) { cpPresenceUnsubscribe(); cpPresenceUnsubscribe = null; }
    }
    if (currentChatUnsubscribe) currentChatUnsubscribe();
    if (currentTypingUnsubscribe) currentTypingUnsubscribe();
    if (currentPresenceUnsubscribe) currentPresenceUnsubscribe();
    if (currentChatId) setTypingStatus(currentChatId, false);
    currentChatId = null;
    currentOtherUser = null;
    switchScreen(dashboardScreen);
  });

  // Input interactions & Typing indicator
  inputMessage.addEventListener('input', () => {
    if (inputMessage.value.trim().length > 0) {
      btnSend.classList.remove('hidden');
      btnVoice.classList.add('hidden');
    } else {
      btnSend.classList.add('hidden');
      btnVoice.classList.remove('hidden');
    }
    
    // Typing logic
    if (currentChatId) {
      setTypingStatus(currentChatId, true);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        setTypingStatus(currentChatId, false);
      }, 1500);
    }
  });

  const sendText = async () => {
    if (!currentChatId || !currentOtherUser) return;
    sendMessage(currentChatId, currentOtherUser, inputMessage.value, null, null, currentReplyContext);
    inputMessage.value = '';
    btnSend.classList.add('hidden');
    btnVoice.classList.remove('hidden');
    setTypingStatus(currentChatId, false);
    if (typeof btnCancelReply !== 'undefined') btnCancelReply.click();
  };

  btnSend.addEventListener('click', sendText);
  inputMessage.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendText();
  });

  window.getCurrentChatId = () => currentChatId;
  window.getCurrentOtherUser = () => currentOtherUser; 
  setupMediaHandling();

  // Dashboard Menu & Filters
  btnDashboardMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      dashboardDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
      if (!dashboardMenuContainer.contains(e.target)) {
          dashboardDropdown.classList.add('hidden');
      }
  });

  btnSelectChats.addEventListener('click', () => {
      isSelectMode = true;
      selectedChats = [];
      dashboardDropdown.classList.add('hidden');
      selectionBar.classList.remove('hidden');
      updateSelectionUI();
      renderRecentChats(currentRecentChats);
  });

  btnReadAll.addEventListener('click', async () => {
      dashboardDropdown.classList.add('hidden');
      const myUid = auth.currentUser.uid;
      for (const chat of currentRecentChats) {
          const unread = chat.unreadCount ? (chat.unreadCount[myUid] || 0) : 0;
          if (unread > 0) {
              const chatRef = doc(db, 'recentChats', chat.id);
              await updateDoc(chatRef, { [`unreadCount.${myUid}`]: 0 });
          }
      }
  });

  filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
          filterPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          currentFilter = pill.dataset.filter;
          renderRecentChats(currentRecentChats);
      });
  });

  // Chat Search Wiring
  const inputChatSearch   = document.getElementById('input-chat-search');
  const btnClearChatSearch = document.getElementById('btn-clear-chat-search');

  if (inputChatSearch) {
      inputChatSearch.addEventListener('input', () => {
          currentSearchQuery = inputChatSearch.value.trim();
          if (btnClearChatSearch) btnClearChatSearch.classList.toggle('hidden', currentSearchQuery === '');
          renderRecentChats(currentRecentChats);
      });
  }

  if (btnClearChatSearch) {
      btnClearChatSearch.addEventListener('click', () => {
          currentSearchQuery = '';
          if (inputChatSearch) { inputChatSearch.value = ''; inputChatSearch.focus(); }
          btnClearChatSearch.classList.add('hidden');
          renderRecentChats(currentRecentChats);
      });
  }

  btnCancelSelect.addEventListener('click', () => {
      isSelectMode = false;
      selectedChats = [];
      selectionBar.classList.add('hidden');
      renderRecentChats(currentRecentChats);
  });

  btnDeleteSelected.addEventListener('click', async () => {
      if (selectedChats.length === 0) return;
      const confirm = window.confirm(`Delete ${selectedChats.length} selected chats? This will clear history locally.`);
      if (!confirm) return;

      btnDeleteSelected.innerHTML = "<i class='bx bx-loader bx-spin'></i>";
      for (const chatId of selectedChats) {
          await deleteChat(chatId);
      }
      
      isSelectMode = false;
      selectedChats = [];
      selectionBar.classList.add('hidden');
      btnDeleteSelected.innerHTML = "Delete";
      renderRecentChats(currentRecentChats);
  });

  function updateSelectionUI() {
      selectedCountEl.textContent = `${selectedChats.length} selected`;
      btnDeleteSelected.disabled = selectedChats.length === 0;
      btnDeleteSelected.style.opacity = selectedChats.length === 0 ? '0.5' : '1';
  }

  // --- Call Log Select & Delete Wiring ---
  const btnSelectCallsEl = document.getElementById('btn-select-calls');
  const callsSelBar = document.getElementById('calls-selection-bar');
  const btnCancelCallSel = document.getElementById('btn-cancel-call-select');
  const btnDeleteCallSel = document.getElementById('btn-delete-call-selected');

  if (btnSelectCallsEl) {
      btnSelectCallsEl.addEventListener('click', function() {
          isCallSelectMode = true;
          selectedCallLogs = [];
          if (callsSelBar) callsSelBar.classList.remove('hidden');
          updateCallSelectionUI();
          renderCallsTab();
      });
  }

  if (btnCancelCallSel) {
      btnCancelCallSel.addEventListener('click', function() {
          isCallSelectMode = false;
          selectedCallLogs = [];
          if (callsSelBar) callsSelBar.classList.add('hidden');
          renderCallsTab();
      });
  }

  if (btnDeleteCallSel) {
      btnDeleteCallSel.addEventListener('click', async function() {
          if (selectedCallLogs.length === 0) return;
          var count = selectedCallLogs.length;
          var ok = window.confirm('Delete ' + count + ' call log' + (count > 1 ? 's' : '') + '? This only removes them for you.');
          if (!ok) return;
          btnDeleteCallSel.innerHTML = "<i class='bx bx-loader bx-spin'></i>";
          var myUid = auth.currentUser.uid;
          for (var i = 0; i < selectedCallLogs.length; i++) {
              await hideCallLog(selectedCallLogs[i].id, myUid);
          }
          isCallSelectMode = false;
          selectedCallLogs = [];
          if (callsSelBar) callsSelBar.classList.add('hidden');
          btnDeleteCallSel.innerHTML = 'Delete';
          renderCallsTab();
      });
  }
}

initApp();
