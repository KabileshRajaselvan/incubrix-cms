// server.js - Enhanced with Public RSS Feed URLs for External Platform Integration + Author/Owner Fields
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const mime = require('mime-types');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const PDFParser = require('pdf-parse');
const XLSX = require('xlsx');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Enhanced middleware with CORS for RSS feeds
app.use(cors({
  origin: '*', // Allow all origins for RSS feeds
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/thumbnails', express.static('thumbnails'));
app.use('/logo.png', express.static(path.join(__dirname, 'logo.png')));

// Serve RSS feed as static file with proper headers
app.use('/rss.xml', (req, res, next) => {
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
}, express.static('rss.xml'));

app.use('/feed.xml', (req, res, next) => {
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
}, express.static('feed.xml'));

// Serve robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /api/rss/\nAllow: /feeds/\nDisallow: /uploads/');
});

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const thumbnailsDir = path.join(__dirname, 'thumbnails');
fs.mkdir(uploadsDir, { recursive: true }).catch(console.error);
fs.mkdir(thumbnailsDir, { recursive: true }).catch(console.error);

// Database setup
let db;

async function initDatabase() {
  db = await open({
    filename: './incubrix_cms.db',
    driver: sqlite3.Database
  });

  let needsMigration = false;

  try {
    const tableInfo = await db.all("PRAGMA table_info(assets)");
    const hasEnhancedFields = tableInfo.some(col => col.name === 'thumbnail_path');
    
    if (tableInfo.length === 0 || !hasEnhancedFields) {
      needsMigration = true;
    }
  } catch (error) {
    needsMigration = true;
  }

  if (needsMigration) {
    console.log('Migrating database to enhanced schema...');
    await db.exec(`DROP TABLE IF EXISTS assets`);
    await db.exec(`DROP TABLE IF EXISTS rss_settings`);
    await db.exec(`DROP TABLE IF EXISTS folder_rss_settings`);
    await db.exec(`DROP TABLE IF EXISTS public_feeds`);
  }

  // Enhanced assets table with Google Drive-like features
  await db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_path TEXT,
      primary_type TEXT NOT NULL CHECK (primary_type IN ('text', 'audio', 'video', 'image', 'document', 'archive', 'other')),
      format TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      duration_seconds REAL,
      page_count INTEGER,
      width INTEGER,
      height INTEGER,
      uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      modified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      uploaded_by TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('raw', 'processed')),
      tags TEXT, -- JSON array as string
      derived_from_asset_id TEXT,
      file_path TEXT NOT NULL,
      is_folder BOOLEAN DEFAULT 0,
      parent_folder_id TEXT,
      folder_path TEXT,
      
      -- Enhanced Google Drive-like fields
      thumbnail_path TEXT,
      preview_available BOOLEAN DEFAULT 0,
      shared BOOLEAN DEFAULT 0,
      starred BOOLEAN DEFAULT 0,
      description TEXT,
      color TEXT, -- For folder colors
      
      -- RSS specific fields
      rss_title TEXT,
      rss_description TEXT,
      rss_category TEXT,
      rss_publish_date DATETIME,
      include_in_rss BOOLEAN DEFAULT 0,
      rss_guid TEXT,
      
      FOREIGN KEY (derived_from_asset_id) REFERENCES assets(id),
      FOREIGN KEY (parent_folder_id) REFERENCES assets(id)
    );
  `);

  // Create RSS settings table with author/owner fields
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rss_settings (
      id INTEGER PRIMARY KEY,
      site_title TEXT DEFAULT 'Incubrix CMS',
      site_description TEXT DEFAULT 'Content Management System RSS Feed',
      site_url TEXT DEFAULT 'http://localhost:3001',
      rss_title TEXT DEFAULT 'Incubrix CMS Feed',
      rss_description TEXT DEFAULT 'Latest content from Incubrix CMS',
      language TEXT DEFAULT 'en-us',
      max_items INTEGER DEFAULT 20,
      auto_include_new_content BOOLEAN DEFAULT 0,
      author_name TEXT DEFAULT '',
      author_email TEXT DEFAULT '',
      owner_name TEXT DEFAULT '',
      owner_email TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create folder RSS settings table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS folder_rss_settings (
      id INTEGER PRIMARY KEY,
      folder_id TEXT NOT NULL,
      include_folder_in_rss BOOLEAN DEFAULT 0,
      rss_title TEXT,
      rss_description TEXT,
      auto_include_new_files BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES assets(id),
      UNIQUE(folder_id)
    );
  `);

  // NEW: Create public feeds table for external platform integration
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public_feeds (
      id TEXT PRIMARY KEY,
      feed_name TEXT NOT NULL,
      feed_description TEXT,
      feed_slug TEXT UNIQUE NOT NULL,
      folder_id TEXT,
      filter_type TEXT, -- 'all', 'folder', 'type', 'tags'
      filter_value TEXT,
      is_active BOOLEAN DEFAULT 1,
      public_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES assets(id)
    );
  `);

  // Insert default RSS settings if not exists
  try {
    const existingSettings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    if (!existingSettings) {
      await db.run(`
        INSERT INTO rss_settings (site_title, site_description, site_url, rss_title, rss_description, author_name, author_email, owner_name, owner_email)
        VALUES ('Incubrix CMS', 'Content Management System RSS Feed', 'http://localhost:3001', 
                'Incubrix CMS Feed', 'Latest content from Incubrix CMS', '', '', '', '')
      `);
      console.log('Default RSS settings created');
    }
  } catch (error) {
    console.warn('Could not create default RSS settings:', error.message);
  }

  // Enhanced indexes
  try {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assets_primary_type ON assets(primary_type);
      CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
      CREATE INDEX IF NOT EXISTS idx_assets_uploaded_at ON assets(uploaded_at);
      CREATE INDEX IF NOT EXISTS idx_assets_modified_at ON assets(modified_at);
      CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);
      CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets(tags);
      CREATE INDEX IF NOT EXISTS idx_assets_size ON assets(size_bytes);
      CREATE INDEX IF NOT EXISTS idx_assets_derived ON assets(derived_from_asset_id);
      CREATE INDEX IF NOT EXISTS idx_assets_parent_folder ON assets(parent_folder_id);
      CREATE INDEX IF NOT EXISTS idx_assets_is_folder ON assets(is_folder);
      CREATE INDEX IF NOT EXISTS idx_assets_starred ON assets(starred);
      CREATE INDEX IF NOT EXISTS idx_assets_shared ON assets(shared);
      CREATE INDEX IF NOT EXISTS idx_assets_include_in_rss ON assets(include_in_rss);
      CREATE INDEX IF NOT EXISTS idx_assets_rss_publish_date ON assets(rss_publish_date);
      CREATE INDEX IF NOT EXISTS idx_folder_rss_folder_id ON folder_rss_settings(folder_id);
      CREATE INDEX IF NOT EXISTS idx_public_feeds_slug ON public_feeds(feed_slug);
      CREATE INDEX IF NOT EXISTS idx_public_feeds_active ON public_feeds(is_active);
    `);
    console.log('Enhanced database indexes created successfully');
  } catch (error) {
    console.warn('Could not create some database indexes:', error.message);
  }

  console.log('Enhanced database initialized successfully');
}

// Enhanced file type classification
function classifyFileType(mimeType, extension) {
  const textTypes = [
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/xml', 'text/html', 
    'text/css', 'text/javascript', 'application/javascript', 'text/rtf', 'application/rtf'
  ];
  const audioTypes = [
    'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/flac', 
    'audio/aac', 'audio/wma', 'audio/opus'
  ];
  const videoTypes = [
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-flv', 
    'video/3gpp', 'video/x-ms-wmv', 'video/mkv', 'video/x-matroska'
  ];
  const imageTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 
    'image/bmp', 'image/tiff', 'image/x-icon', 'image/heic', 'image/heif'
  ];
  const documentTypes = [
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet'
  ];
  const archiveTypes = [
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 
    'application/x-tar', 'application/gzip', 'application/x-bzip2'
  ];

  // Check by MIME type first
  if (textTypes.includes(mimeType)) return 'text';
  if (audioTypes.includes(mimeType)) return 'audio';
  if (videoTypes.includes(mimeType)) return 'video';
  if (imageTypes.includes(mimeType)) return 'image';
  if (documentTypes.includes(mimeType)) return 'document';
  if (archiveTypes.includes(mimeType)) return 'archive';

  // Check by extension
  const ext = extension.toLowerCase();
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'rtf'].includes(ext)) return 'text';
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'wma', 'opus'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'avi', 'webm', 'flv', '3gp', 'wmv', 'mkv'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'heic', 'heif'].includes(ext)) return 'image';
  if (['xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods'].includes(ext)) return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
  
  // Fallback based on MIME type prefix
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  
  return 'other';
}

// Enhanced metadata extraction
async function extractMetadata(filePath, mimeType, primaryType) {
  const metadata = {
    duration_seconds: null,
    page_count: null,
    width: null,
    height: null,
    preview_available: false
  };

  try {
    if (primaryType === 'audio' || primaryType === 'video') {
      const data = await ffprobe(filePath, { path: ffprobeStatic.path });
      if (data.streams && data.streams.length > 0) {
        const stream = data.streams[0];
        metadata.duration_seconds = parseFloat(stream.duration) || null;
        if (primaryType === 'video' && stream.width && stream.height) {
          metadata.width = stream.width;
          metadata.height = stream.height;
        }
        metadata.preview_available = true;
      }
    } else if (primaryType === 'text' && mimeType === 'application/pdf') {
      const buffer = await fs.readFile(filePath);
      const pdfData = await PDFParser(buffer);
      if (pdfData.numpages) {
        metadata.page_count = pdfData.numpages;
      }
      metadata.preview_available = true;
    } else if (primaryType === 'image') {
      metadata.preview_available = true;
    } else if (primaryType === 'text') {
      metadata.preview_available = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js'].includes(
        path.extname(filePath).slice(1).toLowerCase()
      );
    }
  } catch (error) {
    console.warn('Could not extract metadata:', error.message);
  }

  return metadata;
}

// Enhanced RSS functions
function formatRSSDate(date) {
  return new Date(date).toUTCString();
}

function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ENHANCED: Generate RSS Feed with external platform compatibility and author/owner info
async function generateRSSFeed(folderId = null, feedSlug = null) {
  try {
    console.log(`Starting RSS feed generation for ${folderId ? `folder ${folderId}` : feedSlug ? `feed ${feedSlug}` : 'global feed'}...`);
    
    const settings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    if (!settings) {
      throw new Error('RSS settings not found');
    }

    let assets;
    let feedTitle, feedDescription, feedImage;

    // Handle public feed generation
    if (feedSlug) {
      const publicFeed = await db.get('SELECT * FROM public_feeds WHERE feed_slug = ? AND is_active = 1', [feedSlug]);
      if (!publicFeed) {
        throw new Error('Public feed not found or inactive');
      }

      feedTitle = publicFeed.feed_name;
      feedDescription = publicFeed.feed_description || settings.rss_description;

      // Get assets based on filter
      let whereClause = 'include_in_rss = 1 AND is_folder = 0';
      let params = [];

      if (publicFeed.filter_type === 'folder' && publicFeed.folder_id) {
        whereClause += ' AND parent_folder_id = ?';
        params.push(publicFeed.folder_id);
      } else if (publicFeed.filter_type === 'type' && publicFeed.filter_value) {
        whereClause += ' AND primary_type = ?';
        params.push(publicFeed.filter_value);
      } else if (publicFeed.filter_type === 'tags' && publicFeed.filter_value) {
        whereClause += ' AND tags LIKE ?';
        params.push(`%${publicFeed.filter_value}%`);
      }

      assets = await db.all(`
        SELECT * FROM assets 
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN rss_publish_date IS NOT NULL THEN rss_publish_date ELSE uploaded_at END DESC,
          uploaded_at DESC
        LIMIT ?
      `, [...params, settings.max_items]);

    } else if (folderId) {
      // Existing folder RSS logic
      const folderRssSettings = await db.get('SELECT * FROM folder_rss_settings WHERE folder_id = ?', [folderId]);
      const folder = await db.get('SELECT * FROM assets WHERE id = ? AND is_folder = 1', [folderId]);
      
      if (!folder) {
        throw new Error('Folder not found');
      }

      assets = await db.all(`
        WITH RECURSIVE folder_hierarchy AS (
          SELECT id FROM assets WHERE id = ? AND is_folder = 1
          UNION ALL
          SELECT a.id FROM assets a
          INNER JOIN folder_hierarchy fh ON a.parent_folder_id = fh.id
          WHERE a.is_folder = 1
        )
        SELECT a.* FROM assets a
        WHERE a.include_in_rss = 1 AND a.is_folder = 0
        AND (a.parent_folder_id = ? OR a.parent_folder_id IN (SELECT id FROM folder_hierarchy))
        ORDER BY 
          CASE WHEN a.rss_publish_date IS NOT NULL THEN a.rss_publish_date ELSE a.uploaded_at END DESC,
          a.uploaded_at DESC
        LIMIT ?
      `, [folderId, folderId, settings.max_items]);

      feedTitle = folderRssSettings?.rss_title || `${folder.name} - ${settings.rss_title}`;
      feedDescription = folderRssSettings?.rss_description || `Files from ${folder.name} folder - ${settings.rss_description}`;
    } else {
      // Global RSS feed
      assets = await db.all(`
        SELECT * FROM assets 
        WHERE include_in_rss = 1 AND is_folder = 0
        ORDER BY 
          CASE WHEN rss_publish_date IS NOT NULL THEN rss_publish_date ELSE uploaded_at END DESC,
          uploaded_at DESC
        LIMIT ?
      `, [settings.max_items]);

      feedTitle = settings.rss_title;
      feedDescription = settings.rss_description;
    }

    const mostRecentDate = assets.length > 0 
      ? new Date(assets[0].rss_publish_date || assets[0].uploaded_at)
      : new Date();

    // Enhanced RSS XML with better external platform compatibility and author/owner info
    let rssXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/" 
     xmlns:media="http://search.yahoo.com/mrss/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:googleplay="http://www.google.com/schemas/play-podcasts/1.0">
  <channel>
    <title>${escapeXML(feedTitle)}</title>
    <link>${escapeXML(settings.site_url)}</link>
    <description>${escapeXML(feedDescription)}</description>
    <language>${settings.language}</language>
    <lastBuildDate>${formatRSSDate(mostRecentDate)}</lastBuildDate>
    <pubDate>${formatRSSDate(mostRecentDate)}</pubDate>
    <generator>Incubrix Enhanced CMS RSS Generator v2.2</generator>
    <managingEditor>${escapeXML(settings.author_email || settings.site_url)} (${escapeXML(settings.author_name || 'Incubrix CMS')})</managingEditor>
    <webMaster>${escapeXML(settings.owner_email || settings.site_url)} (${escapeXML(settings.owner_name || 'Incubrix CMS')})</webMaster>
    <category>Technology</category>
    <ttl>60</ttl>
    <image>
      <url>${escapeXML(settings.site_url)}/logo.png</url>
      <title>${escapeXML(feedTitle)}</title>
      <link>${escapeXML(settings.site_url)}</link>
    </image>`;

    // Add Atom self-reference for better external platform compatibility
    if (feedSlug) {
      rssXML += `\n    <atom:link href="${escapeXML(settings.site_url)}/feeds/${feedSlug}" rel="self" type="application/rss+xml" />`;
    } else {
      rssXML += `\n    <atom:link href="${escapeXML(settings.site_url)}/api/rss/feed" rel="self" type="application/rss+xml" />`;
    }

    // Add podcast/media-specific elements for better platform compatibility with author/owner info
    if (assets.some(asset => ['audio', 'video'].includes(asset.primary_type))) {
      rssXML += `
    <itunes:summary>${escapeXML(feedDescription)}</itunes:summary>
    <itunes:author>${escapeXML(settings.author_name || 'Incubrix CMS')}</itunes:author>
    <itunes:owner>
      <itunes:name>${escapeXML(settings.owner_name || settings.author_name || 'Incubrix CMS')}</itunes:name>
      <itunes:email>${escapeXML(settings.owner_email || settings.author_email || 'contact@incubrix.com')}</itunes:email>
    </itunes:owner>
    <itunes:category text="Technology" />
    <googleplay:description>${escapeXML(feedDescription)}</googleplay:description>
    <googleplay:author>${escapeXML(settings.author_name || 'Incubrix CMS')}</googleplay:author>
    <googleplay:owner>${escapeXML(settings.owner_email || settings.author_email || 'contact@incubrix.com')}</googleplay:owner>
    <googleplay:category text="Technology" />`;
    }

    for (const asset of assets) {
      const publishDate = asset.rss_publish_date || asset.uploaded_at;
      const guid = asset.rss_guid || asset.id;
      const itemURL = `${settings.site_url}/api/assets/file/${asset.id}`;
      const itemDescription = asset.rss_description || asset.description || `${asset.primary_type} file: ${asset.name}`;
      
      rssXML += `
    <item>
      <title>${escapeXML(asset.rss_title || asset.name)}</title>
      <link>${escapeXML(itemURL)}</link>
      <description><![CDATA[${itemDescription}]]></description>
      <pubDate>${formatRSSDate(publishDate)}</pubDate>
      <guid isPermaLink="false">${escapeXML(guid)}</guid>`;
      
      if (asset.rss_category) {
        rssXML += `
      <category>${escapeXML(asset.rss_category)}</category>`;
      }
      
      // Enhanced enclosure for media files with better platform support
      if (['audio', 'video', 'image'].includes(asset.primary_type)) {
        rssXML += `
      <enclosure url="${escapeXML(itemURL)}" length="${asset.size_bytes}" type="${escapeXML(asset.mime_type)}" />
      <media:content url="${escapeXML(itemURL)}" fileSize="${asset.size_bytes}" type="${escapeXML(asset.mime_type)}"`;
        
        if (asset.duration_seconds) {
          rssXML += ` duration="${Math.round(asset.duration_seconds)}"`;
        }
        if (asset.width && asset.height) {
          rssXML += ` width="${asset.width}" height="${asset.height}"`;
        }
        rssXML += ` />`;

        // iTunes/podcast specific tags for audio content with author info
        if (asset.primary_type === 'audio') {
          rssXML += `
      <itunes:duration>${asset.duration_seconds ? Math.round(asset.duration_seconds) : 0}</itunes:duration>
      <itunes:summary>${escapeXML(itemDescription)}</itunes:summary>
      <itunes:author>${escapeXML(settings.author_name || 'Incubrix CMS')}</itunes:author>`;
        }
      }
      
      rssXML += `
    </item>`;
    }

    rssXML += `
  </channel>
</rss>`;

    // Save global feed
    if (!folderId && !feedSlug) {
      const feedPaths = [
        path.join(__dirname, 'rss.xml'),
        path.join(__dirname, 'feed.xml')
      ];

      for (const feedPath of feedPaths) {
        try {
          await fs.writeFile(feedPath, rssXML, 'utf8');
        } catch (error) {
          console.warn(`Could not write RSS feed to ${feedPath}:`, error.message);
        }
      }
    }
    
    console.log('RSS feed generation completed successfully');
    return rssXML;
  } catch (error) {
    console.error('Error generating RSS feed:', error);
    throw error;
  }
}

// Configure enhanced multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for Google Drive-like experience
    cb(null, true);
  }
});

// NEW API ROUTES FOR PUBLIC RSS FEEDS

// Create a public RSS feed
app.post('/api/rss/feeds', async (req, res) => {
  try {
    const {
      feed_name,
      feed_description,
      feed_slug,
      folder_id,
      filter_type = 'all',
      filter_value
    } = req.body;

    if (!feed_name || !feed_slug) {
      return res.status(400).json({ error: 'Feed name and slug are required' });
    }

    // Validate slug format (URL-safe)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(feed_slug)) {
      return res.status(400).json({ 
        error: 'Feed slug must be lowercase letters, numbers, and hyphens only' 
      });
    }

    const feedId = uuidv4();
    const settings = await db.get('SELECT site_url FROM rss_settings LIMIT 1');
    const publicUrl = `${settings?.site_url || 'http://localhost:3001'}/feeds/${feed_slug}`;

    await db.run(`
      INSERT INTO public_feeds (
        id, feed_name, feed_description, feed_slug, folder_id,
        filter_type, filter_value, public_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      feedId, feed_name, feed_description, feed_slug,
      folder_id === 'root' ? null : folder_id,
      filter_type, filter_value, publicUrl
    ]);

    const newFeed = await db.get('SELECT * FROM public_feeds WHERE id = ?', [feedId]);

    res.status(201).json({
      message: 'Public RSS feed created successfully',
      feed: {
        ...newFeed,
        public_url: publicUrl,
        feed_xml_url: `${settings?.site_url || 'http://localhost:3001'}/feeds/${feed_slug}.xml`
      }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Feed slug already exists' });
    }
    console.error('Create public feed error:', error);
    res.status(500).json({ error: 'Failed to create public RSS feed' });
  }
});

// Get all public RSS feeds
app.get('/api/rss/feeds', async (req, res) => {
  try {
    const feeds = await db.all(`
      SELECT pf.*, a.name as folder_name 
      FROM public_feeds pf
      LEFT JOIN assets a ON pf.folder_id = a.id
      ORDER BY pf.created_at DESC
    `);

    const settings = await db.get('SELECT site_url FROM rss_settings LIMIT 1');
    const baseUrl = settings?.site_url || 'http://localhost:3001';

    const enhancedFeeds = feeds.map(feed => ({
      ...feed,
      public_url: `${baseUrl}/feeds/${feed.feed_slug}`,
      feed_xml_url: `${baseUrl}/feeds/${feed.feed_slug}.xml`,
      feed_json_url: `${baseUrl}/feeds/${feed.feed_slug}.json`
    }));

    res.json({ feeds: enhancedFeeds });
  } catch (error) {
    console.error('Get public feeds error:', error);
    res.status(500).json({ error: 'Failed to fetch public RSS feeds' });
  }
});

// Update public RSS feed
app.put('/api/rss/feeds/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    const {
      feed_name,
      feed_description,
      filter_type,
      filter_value,
      is_active
    } = req.body;

    await db.run(`
      UPDATE public_feeds SET 
        feed_name = ?, feed_description = ?, filter_type = ?,
        filter_value = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [feed_name, feed_description, filter_type, filter_value, is_active, feedId]);

    res.json({ message: 'Public RSS feed updated successfully' });
  } catch (error) {
    console.error('Update public feed error:', error);
    res.status(500).json({ error: 'Failed to update public RSS feed' });
  }
});

// Delete public RSS feed
app.delete('/api/rss/feeds/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    await db.run('DELETE FROM public_feeds WHERE id = ?', [feedId]);
    res.json({ message: 'Public RSS feed deleted successfully' });
  } catch (error) {
    console.error('Delete public feed error:', error);
    res.status(500).json({ error: 'Failed to delete public RSS feed' });
  }
});

// ENHANCED: Public RSS feed endpoints for external platforms
app.get('/feeds/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const rssXML = await generateRSSFeed(null, slug);
    
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    res.send(rssXML);
  } catch (error) {
    console.error('Public RSS feed error:', error);
    res.status(404).json({ error: 'RSS feed not found' });
  }
});

// XML version for better platform compatibility
app.get('/feeds/:slug.xml', async (req, res) => {
  try {
    const { slug } = req.params;
    const rssXML = await generateRSSFeed(null, slug);
    
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('Access-Control-Allow-Origin', '*');
    
    res.send(rssXML);
  } catch (error) {
    console.error('Public RSS XML feed error:', error);
    res.status(404).json({ error: 'RSS feed not found' });
  }
});

// JSON feed version for modern platforms
app.get('/feeds/:slug.json', async (req, res) => {
  try {
    const { slug } = req.params;
    const publicFeed = await db.get('SELECT * FROM public_feeds WHERE feed_slug = ? AND is_active = 1', [slug]);
    
    if (!publicFeed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    const settings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    
    // Get assets for JSON feed
    let whereClause = 'include_in_rss = 1 AND is_folder = 0';
    let params = [];

    if (publicFeed.filter_type === 'folder' && publicFeed.folder_id) {
      whereClause += ' AND parent_folder_id = ?';
      params.push(publicFeed.folder_id);
    } else if (publicFeed.filter_type === 'type' && publicFeed.filter_value) {
      whereClause += ' AND primary_type = ?';
      params.push(publicFeed.filter_value);
    }

    const assets = await db.all(`
      SELECT * FROM assets 
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN rss_publish_date IS NOT NULL THEN rss_publish_date ELSE uploaded_at END DESC,
        uploaded_at DESC
      LIMIT ?
    `, [...params, settings.max_items]);

    // JSON Feed format
    const jsonFeed = {
      version: "https://jsonfeed.org/version/1.1",
      title: publicFeed.feed_name,
      description: publicFeed.feed_description || settings.rss_description,
      home_page_url: settings.site_url,
      feed_url: `${settings.site_url}/feeds/${slug}.json`,
      authors: [{
        name: settings.author_name || 'Incubrix CMS',
        email: settings.author_email || ''
      }],
      items: assets.map(asset => ({
        id: asset.id,
        title: asset.rss_title || asset.name,
        content_text: asset.rss_description || asset.description || '',
        url: `${settings.site_url}/api/assets/file/${asset.id}`,
        date_published: new Date(asset.rss_publish_date || asset.uploaded_at).toISOString(),
        tags: asset.tags ? JSON.parse(asset.tags) : [],
        authors: [{
          name: settings.author_name || 'Incubrix CMS',
          email: settings.author_email || ''
        }],
        attachments: ['audio', 'video', 'image'].includes(asset.primary_type) ? [{
          url: `${settings.site_url}/api/assets/file/${asset.id}`,
          mime_type: asset.mime_type,
          size_in_bytes: asset.size_bytes
        }] : undefined
      }))
    };

    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.set('Access-Control-Allow-Origin', '*');
    
    res.json(jsonFeed);
  } catch (error) {
    console.error('JSON feed error:', error);
    res.status(500).json({ error: 'Failed to generate JSON feed' });
  }
});

// Create new folder
app.post('/api/folders', async (req, res) => {
  try {
    const { name, parent_folder_id, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const folderId = uuidv4();
    let folderPath = name;
    
    if (parent_folder_id && parent_folder_id !== 'root') {
      const parentFolder = await db.get('SELECT folder_path, name FROM assets WHERE id = ? AND is_folder = 1', [parent_folder_id]);
      if (parentFolder) {
        folderPath = parentFolder.folder_path ? `${parentFolder.folder_path}/${name}` : `${parentFolder.name}/${name}`;
      }
    }

    const folder = {
      id: folderId,
      name,
      original_path: name,
      primary_type: 'other',
      format: 'folder',
      mime_type: 'application/x-folder',
      size_bytes: 0,
      uploaded_by: req.body.uploaded_by || 'user@incubrix.com',
      status: 'processed',
      tags: JSON.stringify([]),
      file_path: folderPath,
      is_folder: 1,
      parent_folder_id: parent_folder_id === 'root' ? null : parent_folder_id,
      folder_path: parent_folder_id === 'root' ? null : folderPath.split('/').slice(0, -1).join('/'),
      color: color || '#1a73e8',
      description: description || null,
      include_in_rss: 0
    };

    await db.run(`
      INSERT INTO assets (
        id, name, original_path, primary_type, format, mime_type, size_bytes,
        duration_seconds, page_count, width, height, uploaded_by, status, tags,
        derived_from_asset_id, file_path, is_folder, parent_folder_id, folder_path,
        color, description, rss_title, rss_description, rss_category, rss_publish_date, 
        include_in_rss, rss_guid, thumbnail_path, preview_available, shared, starred
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      folder.id, folder.name, folder.original_path, folder.primary_type, folder.format, 
      folder.mime_type, folder.size_bytes, null, null, null, null, folder.uploaded_by, 
      folder.status, folder.tags, null, folder.file_path, folder.is_folder, 
      folder.parent_folder_id, folder.folder_path, folder.color, folder.description,
      null, null, null, null, folder.include_in_rss, null, null, 0, 0, 0
    ]);

    res.status(201).json({
      message: 'Folder created successfully',
      folder: {
        ...folder,
        tags: [],
        uploaded_at: new Date().toISOString(),
        modified_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Folder RSS Settings Routes
app.get('/api/rss/folder/:folderId/settings', async (req, res) => {
  try {
    const { folderId } = req.params;
    
    // Verify folder exists
    const folder = await db.get('SELECT * FROM assets WHERE id = ? AND is_folder = 1', [folderId]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const settings = await db.get('SELECT * FROM folder_rss_settings WHERE folder_id = ?', [folderId]);
    
    if (settings) {
      res.json(settings);
    } else {
      // Return default settings
      res.json({
        folder_id: folderId,
        include_folder_in_rss: false,
        rss_title: folder.name,
        rss_description: folder.description || '',
        auto_include_new_files: false
      });
    }
  } catch (error) {
    console.error('Get folder RSS settings error:', error);
    res.status(500).json({ error: 'Failed to fetch folder RSS settings' });
  }
});

app.put('/api/rss/folder/:folderId/settings', async (req, res) => {
  try {
    const { folderId } = req.params;
    const { include_folder_in_rss, rss_title, rss_description, auto_include_new_files } = req.body;
    
    // Verify folder exists
    const folder = await db.get('SELECT * FROM assets WHERE id = ? AND is_folder = 1', [folderId]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await db.run(`
      INSERT INTO folder_rss_settings (folder_id, include_folder_in_rss, rss_title, rss_description, auto_include_new_files)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(folder_id) DO UPDATE SET
        include_folder_in_rss = excluded.include_folder_in_rss,
        rss_title = excluded.rss_title,
        rss_description = excluded.rss_description,
        auto_include_new_files = excluded.auto_include_new_files,
        updated_at = CURRENT_TIMESTAMP
    `, [folderId, include_folder_in_rss, rss_title, rss_description, auto_include_new_files]);

    // If folder is included in RSS, automatically include all files if requested
    if (include_folder_in_rss && auto_include_new_files) {
      await db.run(`
        UPDATE assets SET 
          include_in_rss = 1,
          rss_title = COALESCE(rss_title, name),
          rss_category = COALESCE(rss_category, primary_type),
          rss_publish_date = COALESCE(rss_publish_date, uploaded_at),
          rss_guid = COALESCE(rss_guid, id)
        WHERE parent_folder_id = ? AND is_folder = 0
      `, [folderId]);
    }

    await generateRSSFeed(); // Regenerate global feed
    res.json({ message: 'Folder RSS settings updated successfully' });
  } catch (error) {
    console.error('Update folder RSS settings error:', error);
    res.status(500).json({ error: 'Failed to update folder RSS settings' });
  }
});

app.get('/api/rss/folder/:folderId/feed', async (req, res) => {
  try {
    const { folderId } = req.params;
    
    // Verify folder exists
    const folder = await db.get('SELECT * FROM assets WHERE id = ? AND is_folder = 1', [folderId]);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const rssXML = await generateRSSFeed(folderId);
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rssXML);
  } catch (error) {
    console.error('Folder RSS feed generation error:', error);
    res.status(500).json({ error: 'Failed to generate folder RSS feed' });
  }
});

// Star/Unstar assets
app.put('/api/assets/:id/star', async (req, res) => {
  try {
    const { id } = req.params;
    const { starred } = req.body;
    
    await db.run('UPDATE assets SET starred = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?', [starred ? 1 : 0, id]);
    
    res.json({ message: starred ? 'Asset starred' : 'Asset unstarred' });
  } catch (error) {
    console.error('Star asset error:', error);
    res.status(500).json({ error: 'Failed to update star status' });
  }
});

// Share/unshare assets
app.put('/api/assets/:id/share', async (req, res) => {
  try {
    const { id } = req.params;
    const { shared } = req.body;
    
    await db.run('UPDATE assets SET shared = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?', [shared ? 1 : 0, id]);
    
    res.json({ message: shared ? 'Asset shared' : 'Asset unshared' });
  } catch (error) {
    console.error('Share asset error:', error);
    res.status(500).json({ error: 'Failed to update share status' });
  }
});

// Rename asset
app.put('/api/assets/:id/rename', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    await db.run('UPDATE assets SET name = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
    
    res.json({ message: 'Asset renamed successfully' });
  } catch (error) {
    console.error('Rename asset error:', error);
    res.status(500).json({ error: 'Failed to rename asset' });
  }
});

// Update asset description
app.put('/api/assets/:id/description', async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    
    await db.run('UPDATE assets SET description = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?', [description || null, id]);
    
    res.json({ message: 'Description updated successfully' });
  } catch (error) {
    console.error('Update description error:', error);
    res.status(500).json({ error: 'Failed to update description' });
  }
});

// Duplicate asset
app.post('/api/assets/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [id]);
    
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (asset.is_folder) {
      return res.status(400).json({ error: 'Cannot duplicate folders yet' });
    }

    const newId = uuidv4();
    const newName = `${asset.name} (Copy)`;
    
    // Copy the physical file
    const originalExt = path.extname(asset.file_path);
    const newFilePath = path.join(uploadsDir, `${newId}${originalExt}`);
    await fs.copyFile(asset.file_path, newFilePath);

    // Create database record
    await db.run(`
      INSERT INTO assets (
        id, name, original_path, primary_type, format, mime_type, size_bytes,
        duration_seconds, page_count, width, height, uploaded_by, status, tags,
        derived_from_asset_id, file_path, is_folder, parent_folder_id, folder_path,
        color, description, rss_title, rss_description, rss_category, rss_publish_date, 
        include_in_rss, rss_guid, thumbnail_path, preview_available, shared, starred
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newId, newName, asset.original_path, asset.primary_type, asset.format, 
      asset.mime_type, asset.size_bytes, asset.duration_seconds, asset.page_count, 
      asset.width, asset.height, asset.uploaded_by, asset.status, asset.tags, 
      asset.id, newFilePath, 0, asset.parent_folder_id, asset.folder_path,
      asset.color, asset.description, null, null, null, null, 0, null,
      asset.thumbnail_path, asset.preview_available, 0, 0
    ]);

    res.json({ message: 'Asset duplicated successfully', new_id: newId });
  } catch (error) {
    console.error('Duplicate asset error:', error);
    res.status(500).json({ error: 'Failed to duplicate asset' });
  }
});

// Move/Copy assets
app.put('/api/assets/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_parent_id, operation = 'move' } = req.body; // 'move' or 'copy'
    
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [id]);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (operation === 'move') {
      // Update parent folder
      await db.run(
        'UPDATE assets SET parent_folder_id = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ?',
        [new_parent_id === 'root' ? null : new_parent_id, id]
      );
      res.json({ message: 'Asset moved successfully' });
    } else {
      // Copy functionality would be more complex - implement if needed
      res.status(501).json({ error: 'Copy operation not implemented yet' });
    }
  } catch (error) {
    console.error('Move asset error:', error);
    res.status(500).json({ error: 'Failed to move asset' });
  }
});

// Get file content for preview
app.get('/api/assets/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [id]);
    
    if (!asset || asset.is_folder) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (!asset.preview_available) {
      return res.status(400).json({ error: 'Preview not available for this file type' });
    }

    const filePath = asset.file_path;
    
    // Handle different file types for preview
    if (asset.primary_type === 'text') {
      const textTypes = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'csv'];
      if (textTypes.includes(asset.format)) {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          // Limit preview content to avoid memory issues
          const previewContent = content.length > 10000 ? content.substring(0, 10000) + '\n\n... (content truncated)' : content;
          res.json({ 
            type: 'text', 
            content: previewContent, 
            mimeType: asset.mime_type,
            truncated: content.length > 10000 
          });
          return;
        } catch (error) {
          return res.status(404).json({ error: 'File not found' });
        }
      }
    }
    
    // For images, videos, audio - return the file URL for preview
    if (['image', 'video', 'audio'].includes(asset.primary_type)) {
      res.json({ 
        type: asset.primary_type, 
        url: `/api/assets/file/${id}`,
        mimeType: asset.mime_type 
      });
      return;
    }
    
    res.status(400).json({ error: 'Preview not implemented for this file type' });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Enhanced upload with Google Drive-like features and fixed folder structure
app.post('/api/assets/upload', upload.array('files', 1000), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedAssets = [];
    const uploadedBy = req.body.uploaded_by || 'user@incubrix.com';
    const isFolder = req.body.isFolder === 'true';
    const parentFolderId = req.body.parentFolderId || 'root';
    
    // Get RSS settings to check auto-include
    const rssSettings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    const autoIncludeInRSS = rssSettings?.auto_include_new_content || false;
    
    // Check if parent folder has auto-include RSS setting
    let folderAutoInclude = false;
    if (parentFolderId !== 'root') {
      const folderRssSettings = await db.get('SELECT * FROM folder_rss_settings WHERE folder_id = ? AND auto_include_new_files = 1', [parentFolderId]);
      folderAutoInclude = Boolean(folderRssSettings);
    }
    
    console.log(`Processing upload - isFolder: ${isFolder}, files: ${req.files.length}, parentFolder: ${parentFolderId}`);

    if (isFolder) {
      // Enhanced folder upload with proper structure preservation
      const folderStructure = new Map();
      
      // First, create all the folder structures
      const folderPaths = new Set();
      req.files.forEach(file => {
        if (file.webkitRelativePath) {
          const pathParts = file.webkitRelativePath.split('/');
          for (let i = 1; i <= pathParts.length - 1; i++) {
            folderPaths.add(pathParts.slice(0, i).join('/'));
          }
        }
      });

      const sortedFolderPaths = Array.from(folderPaths).sort();
      
      // Create folders
      for (const folderPath of sortedFolderPaths) {
        const pathParts = folderPath.split('/');
        const folderName = pathParts[pathParts.length - 1];
        const parentPath = pathParts.slice(0, -1).join('/');
        
        let actualParentId = parentFolderId === 'root' ? null : parentFolderId;
        if (parentPath) {
          actualParentId = folderStructure.get(parentPath) || actualParentId;
        }
        
        const folderId = uuidv4();
        folderStructure.set(folderPath, folderId);
        
        let fullFolderPath = folderName;
        if (actualParentId) {
          const parentFolder = await db.get('SELECT folder_path, name FROM assets WHERE id = ? AND is_folder = 1', [actualParentId]);
          if (parentFolder) {
            fullFolderPath = parentFolder.folder_path ? `${parentFolder.folder_path}/${folderName}` : `${parentFolder.name}/${folderName}`;
          }
        }
        
        const folder = {
          id: folderId,
          name: folderName,
          original_path: folderPath,
          primary_type: 'other',
          format: 'folder',
          mime_type: 'application/x-folder',
          size_bytes: 0,
          uploaded_by: uploadedBy,
          status: 'processed',
          tags: JSON.stringify([]),
          file_path: fullFolderPath,
          is_folder: 1,
          parent_folder_id: actualParentId,
          folder_path: actualParentId ? fullFolderPath.split('/').slice(0, -1).join('/') : null,
          color: '#1a73e8',
          include_in_rss: 0
        };

        await db.run(`
          INSERT INTO assets (
            id, name, original_path, primary_type, format, mime_type, size_bytes,
            duration_seconds, page_count, width, height, uploaded_by, status, tags,
            derived_from_asset_id, file_path, is_folder, parent_folder_id, folder_path,
            color, description, rss_title, rss_description, rss_category, rss_publish_date, 
            include_in_rss, rss_guid, thumbnail_path, preview_available, shared, starred
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          folder.id, folder.name, folder.original_path, folder.primary_type, folder.format, 
          folder.mime_type, folder.size_bytes, null, null, null, null, folder.uploaded_by, 
          folder.status, folder.tags, null, folder.file_path, folder.is_folder, 
          folder.parent_folder_id, folder.folder_path, folder.color, null,
          null, null, null, null, folder.include_in_rss, null, null, 0, 0, 0
        ]);

        uploadedAssets.push({
          ...folder,
          tags: [],
          uploaded_at: new Date().toISOString(),
          modified_at: new Date().toISOString()
        });
      }

      // Process files - ensure they go into the correct folders
      for (const file of req.files) {
        const id = uuidv4();
        const extension = path.extname(file.originalname).slice(1).toLowerCase();
        const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
        const primaryType = classifyFileType(mimeType, extension);
        
        const metadata = await extractMetadata(file.path, mimeType, primaryType);

        const newFilename = `${id}.${extension || 'unknown'}`;
        const newFilePath = path.join(uploadsDir, newFilename);
        await fs.rename(file.path, newFilePath);

        let fileParentId = parentFolderId === 'root' ? null : parentFolderId;
        let fileFolderPath = null;
        
        if (file.webkitRelativePath) {
          const pathParts = file.webkitRelativePath.split('/');
          pathParts.pop(); // Remove filename
          
          if (pathParts.length > 0) {
            const folderPath = pathParts.join('/');
            fileParentId = folderStructure.get(folderPath);
            
            // Get the full folder path for this file
            if (fileParentId) {
              const parentFolder = await db.get('SELECT folder_path, name FROM assets WHERE id = ? AND is_folder = 1', [fileParentId]);
              if (parentFolder) {
                fileFolderPath = parentFolder.folder_path || parentFolder.name;
              }
            }
          }
        }

        const shouldIncludeInRss = autoIncludeInRSS || folderAutoInclude;
        
        const asset = {
          id,
          name: path.basename(file.originalname),
          original_path: file.webkitRelativePath || file.originalname,
          primary_type: primaryType,
          format: extension || 'unknown',
          mime_type: mimeType,
          size_bytes: file.size,
          duration_seconds: metadata.duration_seconds,
          page_count: metadata.page_count,
          width: metadata.width,
          height: metadata.height,
          uploaded_by: uploadedBy,
          status: 'processed',
          tags: JSON.stringify([]),
          file_path: newFilePath,
          is_folder: 0,
          parent_folder_id: fileParentId,
          folder_path: fileFolderPath,
          preview_available: metadata.preview_available,
          rss_title: shouldIncludeInRss ? path.basename(file.originalname) : null,
          rss_description: shouldIncludeInRss ? `${primaryType} file uploaded` : null,
          rss_category: shouldIncludeInRss ? primaryType : null,
          rss_publish_date: shouldIncludeInRss ? new Date().toISOString() : null,
          include_in_rss: shouldIncludeInRss ? 1 : 0,
          rss_guid: shouldIncludeInRss ? id : null
        };

        await db.run(`
          INSERT INTO assets (
            id, name, original_path, primary_type, format, mime_type, size_bytes,
            duration_seconds, page_count, width, height, uploaded_by, status, tags,
            derived_from_asset_id, file_path, is_folder, parent_folder_id, folder_path,
            color, description, rss_title, rss_description, rss_category, rss_publish_date, 
            include_in_rss, rss_guid, thumbnail_path, preview_available, shared, starred
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          asset.id, asset.name, asset.original_path, asset.primary_type, asset.format, 
          asset.mime_type, asset.size_bytes, asset.duration_seconds, asset.page_count, 
          asset.width, asset.height, asset.uploaded_by, asset.status, asset.tags, 
          null, asset.file_path, asset.is_folder, asset.parent_folder_id, 
          asset.folder_path, null, null, asset.rss_title, asset.rss_description, asset.rss_category,
          asset.rss_publish_date, asset.include_in_rss, asset.rss_guid, null, 
          asset.preview_available ? 1 : 0, 0, 0
        ]);

        uploadedAssets.push({
          ...asset,
          tags: [],
          uploaded_at: new Date().toISOString(),
          modified_at: new Date().toISOString()
        });
      }

    } else {
      // Regular file upload
      for (const file of req.files) {
        const id = uuidv4();
        const extension = path.extname(file.originalname).slice(1).toLowerCase();
        const mimeType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
        const primaryType = classifyFileType(mimeType, extension);
        
        const metadata = await extractMetadata(file.path, mimeType, primaryType);

        const newFilename = `${id}.${extension || 'unknown'}`;
        const newFilePath = path.join(uploadsDir, newFilename);
        await fs.rename(file.path, newFilePath);

        const shouldIncludeInRss = autoIncludeInRSS || folderAutoInclude;

        const asset = {
          id,
          name: path.basename(file.originalname),
          original_path: file.originalname,
          primary_type: primaryType,
          format: extension || 'unknown',
          mime_type: mimeType,
          size_bytes: file.size,
          duration_seconds: metadata.duration_seconds,
          page_count: metadata.page_count,
          width: metadata.width,
          height: metadata.height,
          uploaded_by: uploadedBy,
          status: 'processed',
          tags: JSON.stringify([]),
          file_path: newFilePath,
          is_folder: 0,
          parent_folder_id: parentFolderId === 'root' ? null : parentFolderId,
          folder_path: null,
          preview_available: metadata.preview_available,
          rss_title: shouldIncludeInRss ? path.basename(file.originalname) : null,
          rss_description: shouldIncludeInRss ? `${primaryType} file: ${path.basename(file.originalname)}` : null,
          rss_category: shouldIncludeInRss ? primaryType : null,
          rss_publish_date: shouldIncludeInRss ? new Date().toISOString() : null,
          include_in_rss: shouldIncludeInRss ? 1 : 0,
          rss_guid: shouldIncludeInRss ? id : null
        };

        await db.run(`
          INSERT INTO assets (
            id, name, original_path, primary_type, format, mime_type, size_bytes,
            duration_seconds, page_count, width, height, uploaded_by, status, tags,
            derived_from_asset_id, file_path, is_folder, parent_folder_id, folder_path,
            color, description, rss_title, rss_description, rss_category, rss_publish_date, 
            include_in_rss, rss_guid, thumbnail_path, preview_available, shared, starred
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          asset.id, asset.name, asset.original_path, asset.primary_type, asset.format, 
          asset.mime_type, asset.size_bytes, asset.duration_seconds, asset.page_count, 
          asset.width, asset.height, asset.uploaded_by, asset.status, asset.tags, 
          null, asset.file_path, asset.is_folder, asset.parent_folder_id, 
          asset.folder_path, null, null, asset.rss_title, asset.rss_description, asset.rss_category,
          asset.rss_publish_date, asset.include_in_rss, asset.rss_guid, null, 
          asset.preview_available ? 1 : 0, 0, 0
        ]);

        uploadedAssets.push({
          ...asset,
          tags: [],
          uploaded_at: new Date().toISOString(),
          modified_at: new Date().toISOString()
        });
      }
    }

    // Regenerate RSS feed if needed
    const rssItemsAdded = uploadedAssets.some(asset => asset.include_in_rss);
    if (autoIncludeInRSS || folderAutoInclude || rssItemsAdded) {
      await generateRSSFeed();
    }

    res.status(201).json({
      message: 'Upload completed successfully',
      assets: uploadedAssets,
      rss_items_added: rssItemsAdded ? uploadedAssets.filter(a => a.include_in_rss).length : 0
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
});

// Enhanced get assets with Google Drive-like features
app.get('/api/assets', async (req, res) => {
  try {
    let query = 'SELECT * FROM assets WHERE 1=1';
    const params = [];

    if (req.query.parent_folder_id) {
      if (req.query.parent_folder_id === 'root') {
        query += ' AND parent_folder_id IS NULL';
      } else {
        query += ' AND parent_folder_id = ?';
        params.push(req.query.parent_folder_id);
      }
    }

    if (req.query.primary_type && req.query.primary_type !== 'all') {
      query += ' AND primary_type = ?';
      params.push(req.query.primary_type);
    }

    if (req.query.starred === 'true') {
      query += ' AND starred = 1';
    }

    if (req.query.shared === 'true') {
      query += ' AND shared = 1';
    }

    if (req.query.rss_only === 'true') {
      query += ' AND include_in_rss = 1';
    }

    if (req.query.search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const sortBy = req.query.sort_by || 'modified_at';
    const sortOrder = req.query.sort_order || 'DESC';
    const allowedSortFields = ['name', 'primary_type', 'format', 'size_bytes', 'uploaded_at', 'modified_at'];
    
    if (allowedSortFields.includes(sortBy)) {
      query += ` ORDER BY is_folder DESC, ${sortBy} ${sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const assets = await db.all(query, params);

    const processedAssets = assets.map(asset => ({
      ...asset,
      tags: JSON.parse(asset.tags || '[]'),
      file_url: asset.is_folder ? null : `/api/assets/file/${asset.id}`,
      preview_url: asset.preview_available ? `/api/assets/${asset.id}/preview` : null,
      is_folder: Boolean(asset.is_folder),
      starred: Boolean(asset.starred),
      shared: Boolean(asset.shared),
      preview_available: Boolean(asset.preview_available),
      include_in_rss: Boolean(asset.include_in_rss)
    }));

    res.json({
      assets: processedAssets,
      pagination: {
        page,
        limit,
        total: processedAssets.length
      }
    });

  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// Get statistics
app.get('/api/assets/stats', async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_assets,
        COUNT(CASE WHEN is_folder = 1 THEN 1 END) as total_folders,
        COUNT(CASE WHEN is_folder = 0 THEN 1 END) as total_files,
        COUNT(CASE WHEN starred = 1 THEN 1 END) as starred_items,
        COUNT(CASE WHEN shared = 1 THEN 1 END) as shared_items,
        COUNT(CASE WHEN include_in_rss = 1 AND is_folder = 0 THEN 1 END) as total_rss_items,
        SUM(CASE WHEN is_folder = 0 THEN size_bytes ELSE 0 END) as total_size,
        AVG(CASE WHEN is_folder = 0 THEN size_bytes END) as avg_size
      FROM assets
    `);

    const typeBreakdown = await db.all(`
      SELECT primary_type, COUNT(*) as count 
      FROM assets WHERE is_folder = 0
      GROUP BY primary_type
    `);

    res.json({
      ...stats,
      typeBreakdown
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Clear all data
app.delete('/api/assets/clear-all', async (req, res) => {
  try {
    console.log('Clearing all existing data...');
    
    const allAssets = await db.all('SELECT file_path, is_folder FROM assets');
    
    for (const asset of allAssets) {
      if (!asset.is_folder) {
        try {
          await fs.unlink(asset.file_path);
        } catch (fileError) {
          console.warn('Could not delete file:', fileError.message);
        }
      }
    }
    
    await db.run('DELETE FROM assets');
    await db.run('DELETE FROM folder_rss_settings');
    await db.run('DELETE FROM public_feeds');
    await generateRSSFeed();
    
    res.json({ message: 'All data cleared successfully' });
  } catch (error) {
    console.error('Clear data error:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// RSS API Routes
app.get('/api/rss/settings', async (req, res) => {
  try {
    const settings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    res.json(settings);
  } catch (error) {
    console.error('Get RSS settings error:', error);
    res.status(500).json({ error: 'Failed to fetch RSS settings' });
  }
});

app.put('/api/rss/settings', async (req, res) => {
  try {
    const {
      site_title, site_description, site_url, rss_title, rss_description,
      language, max_items, auto_include_new_content, author_name, author_email,
      owner_name, owner_email
    } = req.body;

    // Trim the site_url to remove any spaces
    const trimmedSiteUrl = site_url?.trim() || 'http://localhost:3001';

    await db.run(`
      UPDATE rss_settings SET 
        site_title = ?, site_description = ?, site_url = ?, 
        rss_title = ?, rss_description = ?, language = ?, 
        max_items = ?, auto_include_new_content = ?, author_name = ?,
        author_email = ?, owner_name = ?, owner_email = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [
      site_title, site_description, trimmedSiteUrl, rss_title, 
      rss_description, language, max_items, auto_include_new_content,
      author_name, author_email, owner_name, owner_email
    ]);


    await generateRSSFeed();
    res.json({ message: 'RSS settings updated successfully' });
  } catch (error) {
    console.error('Update RSS settings error:', error);
    res.status(500).json({ error: 'Failed to update RSS settings' });
  }
});

app.get('/api/rss/feed', async (req, res) => {
  try {
    const rssXML = await generateRSSFeed();
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rssXML);
  } catch (error) {
    console.error('RSS feed generation error:', error);
    res.status(500).json({ error: 'Failed to generate RSS feed' });
  }
});

app.get('/api/rss/preview', async (req, res) => {
  try {
    const settings = await db.get('SELECT * FROM rss_settings LIMIT 1');
    const assets = await db.all(`
      SELECT * FROM assets 
      WHERE include_in_rss = 1 AND is_folder = 0
      ORDER BY rss_publish_date DESC, uploaded_at DESC
      LIMIT ?
    `, [settings?.max_items || 20]);

    res.json({
      settings,
      items: assets.map(asset => ({
        ...asset,
        tags: asset.tags ? JSON.parse(asset.tags) : [],
        item_url: `${settings?.site_url || 'http://localhost:3001'}/api/assets/file/${asset.id}`
      }))
    });
  } catch (error) {
    console.error('RSS preview error:', error);
    res.status(500).json({ error: 'Failed to generate RSS preview' });
  }
});

app.put('/api/assets/:id/rss', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      include_in_rss, rss_title, rss_description, rss_category,
      rss_publish_date, rss_guid
    } = req.body;

    await db.run(`
      UPDATE assets SET 
        include_in_rss = ?, rss_title = ?, rss_description = ?, 
        rss_category = ?, rss_publish_date = ?, rss_guid = ?,
        modified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      include_in_rss, rss_title, rss_description, 
      rss_category, rss_publish_date, rss_guid, id
    ]);

    if (include_in_rss) {
      await generateRSSFeed();
    }

    res.json({ message: 'Asset RSS properties updated successfully' });
  } catch (error) {
    console.error('Update asset RSS error:', error);
    res.status(500).json({ error: 'Failed to update asset RSS properties' });
  }
});

// Analytics Routes
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const overview = await db.get(`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN is_folder = 1 THEN 1 END) as total_folders,
        COUNT(CASE WHEN include_in_rss = 1 AND is_folder = 0 THEN 1 END) as total_rss_items,
        SUM(CASE WHEN is_folder = 0 THEN size_bytes ELSE 0 END) as total_size,
        AVG(CASE WHEN is_folder = 0 THEN size_bytes END) as avg_size,
        COUNT(DISTINCT uploaded_by) as unique_uploaders
      FROM assets
    `);

    const typeBreakdown = await db.all(`
      SELECT primary_type, COUNT(*) as count 
      FROM assets WHERE is_folder = 0
      GROUP BY primary_type
    `);

    const recentActivity = await db.all(`
      SELECT DATE(uploaded_at) as date, COUNT(*) as uploads
      FROM assets 
      WHERE uploaded_at >= datetime('now', '-30 days') AND is_folder = 0
      GROUP BY DATE(uploaded_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      overview,
      typeBreakdown,
      recentActivity
    });
  } catch (error) {
    console.error('Overview analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch overview analytics' });
  }
});

app.get('/api/analytics/monthly-uploads', async (req, res) => {
  try {
    const monthlyData = await db.all(`
      SELECT 
        strftime('%Y-%m', uploaded_at) as month,
        COUNT(*) as count,
        SUM(size_bytes) as total_size
      FROM assets 
      WHERE uploaded_at >= datetime('now', '-12 months') AND is_folder = 0
      GROUP BY strftime('%Y-%m', uploaded_at)
      ORDER BY month DESC
    `);

    res.json(monthlyData);
  } catch (error) {
    console.error('Monthly uploads analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly analytics' });
  }
});

// Export to Excel
app.get('/api/assets/export/excel', async (req, res) => {
  try {
    const allAssets = await db.all('SELECT * FROM assets ORDER BY is_folder DESC, primary_type, uploaded_at DESC');
    
    if (!allAssets || allAssets.length === 0) {
      return res.status(404).json({ error: 'No assets found to export' });
    }

    const processedAssets = allAssets.map(asset => ({
      ID: asset.id,
      Name: asset.name,
      'Is Folder': asset.is_folder ? 'Yes' : 'No',
      'Primary Type': asset.primary_type,
      Format: asset.format.toUpperCase(),
      'MIME Type': asset.mime_type,
      'Size (Bytes)': asset.size_bytes,
      'Size (Human)': formatFileSize(asset.size_bytes),
      'Uploaded At': new Date(asset.uploaded_at).toLocaleString(),
      'Modified At': new Date(asset.modified_at).toLocaleString(),
      'Uploaded By': asset.uploaded_by,
      Starred: asset.starred ? 'Yes' : 'No',
      Shared: asset.shared ? 'Yes' : 'No',
      'Preview Available': asset.preview_available ? 'Yes' : 'No',
      Description: asset.description || '',
      'Include in RSS': asset.include_in_rss ? 'Yes' : 'No',
      'RSS Title': asset.rss_title || '',
      'RSS Description': asset.rss_description || '',
      'RSS Category': asset.rss_category || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(processedAssets);
    
    // Auto-size columns
    const cols = Object.keys(processedAssets[0] || {}).map(key => ({
      wch: Math.max(key.length + 2, 15)
    }));
    ws['!cols'] = cols;
    
    XLSX.utils.book_append_sheet(wb, ws, 'All Assets');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `Incubrix_Drive_Export_${timestamp}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ error: 'Failed to export Excel file: ' + error.message });
  }
});

// Serve RSS feed at root level
app.get('/rss', async (req, res) => {
  try {
    const rssXML = await generateRSSFeed();
    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(rssXML);
  } catch (error) {
    console.error('RSS feed error:', error);
    res.status(500).json({ error: 'RSS feed unavailable' });
  }
});

// Delete asset/folder helper functions
async function deleteFolder(folderId) {
  const children = await db.all('SELECT * FROM assets WHERE parent_folder_id = ?', [folderId]);
  
  for (const child of children) {
    if (child.is_folder) {
      await deleteFolder(child.id);
    } else {
      await deleteFile(child.id);
    }
  }
  
  // Delete folder RSS settings
  await db.run('DELETE FROM folder_rss_settings WHERE folder_id = ?', [folderId]);
  
  // Delete the folder itself
  await db.run('DELETE FROM assets WHERE id = ?', [folderId]);
}

async function deleteFile(fileId) {
  const file = await db.get('SELECT * FROM assets WHERE id = ?', [fileId]);
  
  if (file && !file.is_folder) {
    try {
      await fs.unlink(file.file_path);
      if (file.thumbnail_path) {
        await fs.unlink(file.thumbnail_path).catch(() => {});
      }
    } catch (error) {
      console.warn('Could not delete physical file:', error.message);
    }
  }
  
  await db.run('DELETE FROM assets WHERE id = ?', [fileId]);
}

// Delete assets
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [assetId]);
    
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (asset.is_folder) {
      await deleteFolder(assetId);
    } else {
      await deleteFile(assetId);
    }

    await generateRSSFeed();
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Get breadcrumb navigation
app.get('/api/assets/breadcrumb/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    const breadcrumb = [];
    
    if (assetId === 'root') {
      return res.json([{ id: 'root', name: 'My Drive', is_folder: true }]);
    }
    
    let currentId = assetId;
    
    while (currentId) {
      const asset = await db.get('SELECT id, name, parent_folder_id, is_folder FROM assets WHERE id = ?', [currentId]);
      
      if (!asset) break;
      
      breadcrumb.unshift({
        id: asset.id,
        name: asset.name,
        is_folder: Boolean(asset.is_folder)
      });
      
      currentId = asset.parent_folder_id;
    }
    
    breadcrumb.unshift({ id: 'root', name: 'My Drive', is_folder: true });
    
    res.json(breadcrumb);
  } catch (error) {
    console.error('Breadcrumb error:', error);
    res.status(500).json({ error: 'Failed to get breadcrumb' });
  }
});

// Serve files
app.get('/api/assets/file/:id', async (req, res) => {
  try {
    const asset = await db.get('SELECT * FROM assets WHERE id = ?', [req.params.id]);
    
    if (!asset || asset.is_folder) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      await fs.access(asset.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', asset.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${asset.name}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    const fileStream = require('fs').createReadStream(asset.file_path);
    fileStream.pipe(res);

  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '2.2.0',
    features: [
      'Google Drive-like interface', 
      'RSS feeds', 
      'Enhanced file management', 
      'Folder RSS settings',
      'Public RSS feeds for external platforms',
      'JSON Feed support',
      'External platform integration',
      'YouTube Studio RSS compatibility',
      'Author/Owner RSS fields'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    
    try {
      await generateRSSFeed();
      console.log('Initial RSS feed generated successfully');
    } catch (error) {
      console.warn('Could not generate initial RSS feed:', error.message);
    }
    
    app.listen(PORT, () => {
      console.log(`✅ Incubrix Enhanced CMS Server v2.2 running on port ${PORT}`);
      console.log(`📁 Upload directory: ${uploadsDir}`);
      console.log(`🗄️ Database: ./incubrix_cms.db`);
      console.log(`🌐 API URL: http://localhost:${PORT}/api`);
      console.log('');
      console.log('🚀 Enhanced Features:');
      console.log('   • Google Drive-like interface');
      console.log('   • Enhanced folder management');
      console.log('   • File previews');
      console.log('   • Star/favorite files');
      console.log('   • File sharing');
      console.log('   • Individual file/folder deletion');
      console.log('   • Enhanced metadata display');
      console.log('   • Improved file organization');
      console.log('   • RSS feed support');
      console.log('   • Folder-specific RSS feeds');
      console.log('   • 🆕 Public RSS feeds for external platforms');
      console.log('   • 🆕 JSON Feed support');
      console.log('   • 🆕 External platform integration (YouTube Studio, etc.)');
      console.log('   • 🆕 Author/Owner RSS fields for YouTube compatibility');
      console.log('   • Analytics dashboard');
      console.log('   • Excel export');
      console.log('');
      console.log('📡 RSS Feed Endpoints:');
      console.log(`   • Global RSS: http://localhost:${PORT}/api/rss/feed`);
      console.log(`   • Public feeds: http://localhost:${PORT}/feeds/{slug}`);
      console.log(`   • JSON feeds: http://localhost:${PORT}/feeds/{slug}.json`);
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;