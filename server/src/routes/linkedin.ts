import { Router, type Request, type Response } from 'express';
import { linkedinService } from '../services/linkedinService';

export const linkedinRouter = Router();

/**
 * GET /api/linkedin/status
 * Get connection status and daily safe limit counters
 */
linkedinRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await linkedinService.getAccountStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    console.error('[LinkedIn API] status error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to get LinkedIn status' });
  }
});

/**
 * GET /api/linkedin/accounts
 * Get all synced LinkedIn accounts
 */
linkedinRouter.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await linkedinService.getAllAccounts();
    res.json({ success: true, data: accounts });
  } catch (err: any) {
    console.error('[LinkedIn API] accounts error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to get LinkedIn accounts' });
  }
});

/**
 * POST /api/linkedin/accounts
 * Sync/add a new LinkedIn account
 */
linkedinRouter.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { accountName, headline, profileUrl, sessionCookie, accessToken, authMethod } = req.body;
    if (!accountName) {
      return res.status(400).json({ success: false, error: 'accountName is required' });
    }
    const account = await linkedinService.addAccount({
      accountName,
      headline,
      profileUrl,
      sessionCookie,
      accessToken,
      authMethod,
    });
    res.json({ success: true, message: 'LinkedIn account synced successfully', data: account });
  } catch (err: any) {
    console.error('[LinkedIn API] add account error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to add LinkedIn account' });
  }
});

/**
 * DELETE /api/linkedin/accounts/:id
 * Remove a synced LinkedIn account
 */
linkedinRouter.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = await linkedinService.deleteAccount(id);
    res.json({ success: ok, message: ok ? 'LinkedIn account removed' : 'Account not found' });
  } catch (err: any) {
    console.error('[LinkedIn API] delete account error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete LinkedIn account' });
  }
});

/**
 * POST /api/linkedin/connect
 * Save credentials, li_at session cookie, or OAuth token
 */
linkedinRouter.post('/connect', async (req: Request, res: Response) => {
  try {
    const { accountName, headline, profileUrl, sessionCookie, accessToken, authMethod } = req.body;
    const status = await linkedinService.connectAccount({
      accountName,
      headline,
      profileUrl,
      sessionCookie,
      accessToken,
      authMethod,
    });
    res.json({ success: true, message: 'LinkedIn account connected successfully', data: status });
  } catch (err: any) {
    console.error('[LinkedIn API] connect error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to connect LinkedIn account' });
  }
});

/**
 * POST /api/linkedin/disconnect
 * Disconnect account
 */
linkedinRouter.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    await linkedinService.disconnectAccount();
    res.json({ success: true, message: 'LinkedIn account disconnected' });
  } catch (err: any) {
    console.error('[LinkedIn API] disconnect error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to disconnect LinkedIn account' });
  }
});

/**
 * POST /api/linkedin/generate-post
 * Use AI to generate a viral B2B LinkedIn post draft
 */
linkedinRouter.post('/generate-post', async (req: Request, res: Response) => {
  try {
    const { topic, tone, targetAudience, callToAction } = req.body;
    const draft = await linkedinService.generatePost({
      topic,
      tone,
      targetAudience,
      callToAction,
    });
    res.json({ success: true, data: draft });
  } catch (err: any) {
    console.error('[LinkedIn API] generate-post error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate LinkedIn post' });
  }
});

/**
 * GET /api/linkedin/posts
 * Fetch all published, scheduled, and draft posts
 */
linkedinRouter.get('/posts', async (_req: Request, res: Response) => {
  try {
    const posts = await linkedinService.getPosts();
    res.json({ success: true, count: posts.length, data: posts });
  } catch (err: any) {
    console.error('[LinkedIn API] getPosts error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch LinkedIn posts' });
  }
});

/**
 * POST /api/linkedin/posts
 * Create, publish, or schedule a post
 */
linkedinRouter.post('/posts', async (req: Request, res: Response) => {
  try {
    const { title, content, status, scheduledFor, tags, aiGenerated } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Post content cannot be empty' });
    }
    const post = await linkedinService.createPost({
      title,
      content,
      status,
      scheduledFor,
      tags,
      aiGenerated,
    });
    res.json({
      success: true,
      message: status === 'scheduled' ? 'Post scheduled successfully' : 'Post published to LinkedIn successfully',
      data: post,
    });
  } catch (err: any) {
    console.error('[LinkedIn API] createPost error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create LinkedIn post' });
  }
});

/**
 * PUT /api/linkedin/posts/:id
 * Update content, title, or reschedule a LinkedIn post
 */
linkedinRouter.put('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { title, content, status, scheduledFor } = req.body;
    const post = await linkedinService.updatePost(id, {
      title,
      content,
      status,
      scheduledFor,
    });
    res.json({ success: true, message: 'Post updated successfully', data: post });
  } catch (err: any) {
    console.error('[LinkedIn API] updatePost error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update post' });
  }
});

/**
 * POST /api/linkedin/posts/:id/publish-live
 * Attempt live publish via automated session or return direct share payload
 */
linkedinRouter.post('/posts/:id/publish-live', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const post = await linkedinService.publishExistingPost(id);
    res.json({
      success: true,
      message: post.liveDelivery ? 'Post published directly to LinkedIn feed!' : 'Direct share launcher ready',
      data: post,
    });
  } catch (err: any) {
    console.error('[LinkedIn API] publish-live error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to publish post live' });
  }
});

/**
 * POST /api/linkedin/posts/:id/confirm
 * Mark a post as confirmed published to LinkedIn
 */
linkedinRouter.post('/posts/:id/confirm', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const post = await linkedinService.confirmManualPost(id);
    res.json({ success: true, message: 'Post marked as confirmed on LinkedIn profile', data: post });
  } catch (err: any) {
    console.error('[LinkedIn API] confirm error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to confirm post' });
  }
});

/**
 * POST /api/linkedin/verify-cookie
 * Test if a li_at session cookie logs in cleanly
 */
linkedinRouter.post('/verify-cookie', async (req: Request, res: Response) => {
  try {
    const { sessionCookie } = req.body;
    const result = await linkedinService.verifySessionCookie(sessionCookie);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[LinkedIn API] verify-cookie error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to verify session cookie' });
  }
});

/**
 * DELETE /api/linkedin/posts/:id
 * Delete a post
 */
linkedinRouter.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await linkedinService.deletePost(id);
    res.json({ success: true, message: 'Post deleted' });
  } catch (err: any) {
    console.error('[LinkedIn API] deletePost error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete post' });
  }
});

/**
 * GET /api/linkedin/prospect-comments
 * Fetch detected prospect posts & generated comments
 */
linkedinRouter.get('/prospect-comments', async (_req: Request, res: Response) => {
  try {
    const tasks = await linkedinService.getProspectCommentTasks();
    res.json({ success: true, count: tasks.length, data: tasks });
  } catch (err: any) {
    console.error('[LinkedIn API] prospect-comments error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch prospect comment tasks' });
  }
});

/**
 * POST /api/linkedin/prospect-comments/:id/approve
 * Approve & post comment to prospect's post
 */
linkedinRouter.post('/prospect-comments/:id/approve', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { customComment } = req.body;
    const updated = await linkedinService.approveAndPostComment(id, customComment);
    res.json({ success: true, message: 'Comment posted to prospect post', data: updated });
  } catch (err: any) {
    console.error('[LinkedIn API] approve comment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to approve comment' });
  }
});

/**
 * POST /api/linkedin/prospect-comments/:id/skip
 * Skip comment task
 */
linkedinRouter.post('/prospect-comments/:id/skip', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await linkedinService.skipCommentTask(id);
    res.json({ success: true, message: 'Comment task skipped' });
  } catch (err: any) {
    console.error('[LinkedIn API] skip comment error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to skip comment' });
  }
});

/**
 * POST /api/linkedin/prospect-comments
 * Add a new prospect post to monitor
 */
linkedinRouter.post('/prospect-comments', async (req: Request, res: Response) => {
  try {
    const { prospectName, prospectHeadline, prospectProfileUrl, postUrl, postSnippet, leadId } = req.body;
    if (!prospectName || !postSnippet) {
      return res.status(400).json({ success: false, error: 'Prospect name and post snippet are required' });
    }
    const task = await linkedinService.addProspectPostToMonitor({
      prospectName,
      prospectHeadline,
      prospectProfileUrl,
      postUrl,
      postSnippet,
      leadId,
    });
    res.json({ success: true, message: 'Prospect post added and AI comment drafted', data: task });
  } catch (err: any) {
    console.error('[LinkedIn API] add prospect post error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to add prospect post' });
  }
});
