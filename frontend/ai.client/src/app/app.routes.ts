import { Routes } from '@angular/router';
import { ConversationPage } from './conversation/conversation.page';

export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./conversation/conversation.page').then(m => m.ConversationPage),
    },
    {
        path: 'c/:conversationId',
        loadComponent: () => import('./conversation/conversation.page').then(m => m.ConversationPage),
    },
    {
        path: 'auth/callback',
        loadComponent: () => import('./auth/callback/callback.page').then(m => m.CallbackPage),
    }
];
