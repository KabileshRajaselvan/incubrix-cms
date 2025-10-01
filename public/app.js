import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  Upload, Search, Grid, List, FileText, Music, Video, File, 
  RefreshCw, BarChart3, FolderOpen, Image, HardDrive, Users, X, Info, Menu, FileSpreadsheet,
  Folder, ExternalLink, Trash2, Home, ChevronRight, Download, Archive, Check, AlertTriangle, 
  Star, Eye, Copy, Rss, Settings, Globe, Calendar, Tag, Link, Save, Radio, Zap,
  Plus, Edit3, Move, Share, FolderPlus, MoreHorizontal, ChevronDown, ZoomIn, Play, Pause,
  Maximize2, Minimize2, ArrowLeft, ArrowRight, RotateCcw, RotateCw, Youtube, Mic, Monitor
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

const API_BASE_URL = window.location.origin + '/api';

const IncubrixCMS = () => {
  // State management
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState('grid');
  const [sortBy, setSortBy] = useState('modified_at');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    primary_type: 'all',
    starred: false,
    shared: false,
    rss_only: false
  });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [stats, setStats] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('library');
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [breadcrumb, setBreadcrumb] = useState([{ id: 'root', name: 'My Drive', is_folder: true }]);
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [renameModal, setRenameModal] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  // Enhanced RSS states for YouTube Studio compatibility
  const [rssSettings, setRssSettings] = useState(null);
  const [rssPreview, setRssPreview] = useState(null);
  const [editingRssAsset, setEditingRssAsset] = useState(null);
  const [rssSettingsModal, setRssSettingsModal] = useState(false);
  const [folderRssModal, setFolderRssModal] = useState(null);
  const [loadingRss, setLoadingRss] = useState(false);
  const [publicFeeds, setPublicFeeds] = useState([]);
  const [publicFeedModal, setPublicFeedModal] = useState(false);
  const [editingPublicFeed, setEditingPublicFeed] = useState(null);
  const [youtubeVerification, setYoutubeVerification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Analytics states
  const [analyticsData, setAnalyticsData] = useState({
    monthlyUploads: [],
    overview: null
  });

  // Refs
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const dragRef = useRef(null);

  // Check if this is first time (no assets)
  const isFirstTime = useMemo(() => {
    return stats && stats.total_assets === 0 && stats.total_folders === 0;
  }, [stats]);

  // Helper functions
  const formatFileSize = (bytes) => {
    if (bytes === null || bytes === undefined || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyRssFeedUrl = useCallback((folderId = null, feedSlug = null) => {
    let feedUrl;
    if (feedSlug) {
      feedUrl = `${window.location.protocol}//${window.location.host}/feeds/${feedSlug}`;
    } else if (folderId && folderId !== 'root') {
      feedUrl = `${window.location.protocol}//${window.location.host}/api/rss/folder/${folderId}/feed`;
    } else {
      feedUrl = `${window.location.protocol}//${window.location.host}/api/rss/feed`;
    }
    
    navigator.clipboard.writeText(feedUrl).then(() => {
      setSuccess('RSS feed URL copied to clipboard! This URL is YouTube Studio compatible.');
      setTimeout(() => setSuccess(null), 5000);
    }).catch(() => {
      setError('Failed to copy RSS feed URL');
    });
  }, []);

  // Enhanced Google Drive-style file type icons
  const getTypeIcon = (primary_type, format, size = 'large') => {
    const iconSize = size === 'large' ? 'w-12 h-12' : 'w-6 h-6';
    const textSize = size === 'large' ? 'text-xs' : 'text-[8px]';
    
    // Folder
    if (format === 'folder') {
      return (
        <div className={`${iconSize} flex items-center justify-center`}>
          <Folder className={`${iconSize} text-blue-500`} />
        </div>
      );
    }

    // Documents with Google Drive-style colors
    if (primary_type === 'text') {
      if (format === 'pdf') {
        return <div className={`${iconSize} bg-red-500 rounded-lg flex items-center justify-center text-white font-bold ${textSize}`}>PDF</div>;
      }
      if (['doc', 'docx'].includes(format)) {
        return <div className={`${iconSize} bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold ${textSize}`}>DOC</div>;
      }
      if (['xls', 'xlsx'].includes(format)) {
        return <div className={`${iconSize} bg-green-600 rounded-lg flex items-center justify-center text-white font-bold ${textSize}`}>XLS</div>;
      }
      if (['ppt', 'pptx'].includes(format)) {
        return <div className={`${iconSize} bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold ${textSize}`}>PPT</div>;
      }
      return <div className={`${iconSize} bg-gray-600 rounded-lg flex items-center justify-center text-white`}><FileText className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
    }

    // Images
    if (primary_type === 'image') {
      return <div className={`${iconSize} bg-pink-500 rounded-lg flex items-center justify-center text-white`}><Image className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
    }

    // Videos
    if (primary_type === 'video') {
      return <div className={`${iconSize} bg-red-600 rounded-lg flex items-center justify-center text-white`}><Video className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
    }

    // Audio
    if (primary_type === 'audio') {
      return <div className={`${iconSize} bg-green-600 rounded-lg flex items-center justify-center text-white`}><Music className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
    }

    // Archives
    if (primary_type === 'archive') {
      return <div className={`${iconSize} bg-orange-600 rounded-lg flex items-center justify-center text-white`}><Archive className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
    }

    // Default
    return <div className={`${iconSize} bg-gray-500 rounded-lg flex items-center justify-center text-white`}><File className={size === 'large' ? 'w-6 h-6' : 'w-4 h-4'} /></div>;
  };

  // API Functions
  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        parent_folder_id: currentFolderId,
        ...filters,
        search: searchQuery,
        sort_by: sortBy
      });

      const response = await fetch(`${API_BASE_URL}/assets?${params}`);
      if (!response.ok) throw new Error('Failed to fetch assets');
      
      const data = await response.json();
      setAssets(data.assets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, filters, searchQuery, sortBy]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/assets/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Stats fetch error:', err);
    }
  }, []);

  const fetchRssSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rss/settings`);
      if (!response.ok) throw new Error('Failed to fetch RSS settings');
      const data = await response.json();
      setRssSettings(data);
    } catch (err) {
      console.error('RSS settings fetch error:', err);
    }
  }, []);

  const fetchPublicFeeds = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rss/feeds`);
      if (!response.ok) throw new Error('Failed to fetch public feeds');
      const data = await response.json();
      setPublicFeeds(data.feeds || []);
    } catch (err) {
      console.error('Public feeds fetch error:', err);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [overviewRes, monthlyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/analytics/overview`),
        fetch(`${API_BASE_URL}/analytics/monthly-uploads`)
      ]);

      if (overviewRes.ok && monthlyRes.ok) {
        const [overview, monthly] = await Promise.all([
          overviewRes.json(),
          monthlyRes.json()
        ]);
        
        setAnalyticsData({
          overview,
          monthlyUploads: monthly
        });
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    }
  }, []);

  const fetchRssPreview = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/rss/preview`);
      if (!response.ok) throw new Error('Failed to fetch RSS preview');
      const data = await response.json();
      setRssPreview(data);
    } catch (err) {
      console.error('RSS preview fetch error:', err);
    }
  }, []);

  const updateRssSettings = async (settings) => {
    try {
      setLoadingRss(true);
      const response = await fetch(`${API_BASE_URL}/rss/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Failed to update RSS settings');
      
      await fetchRssSettings();
      setSuccess('RSS settings updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRss(false);
    }
  };

  const updateAssetRss = async (assetId, rssData) => {
    try {
      setLoadingRss(true);
      const response = await fetch(`${API_BASE_URL}/assets/${assetId}/rss`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rssData)
      });

      if (!response.ok) throw new Error('Failed to update asset RSS properties');
      
      await fetchAssets();
      setSuccess('Asset RSS properties updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRss(false);
    }
  };

  const openFile = (asset) => {
    if (asset.is_folder) {
      navigateToFolder(asset.id);
    } else {
      window.open(`${API_BASE_URL}/assets/file/${asset.id}`, '_blank');
    }
  };

  const navigateToFolder = async (folderId) => {
    setCurrentFolderId(folderId);
    
    try {
      const response = await fetch(`${API_BASE_URL}/assets/breadcrumb/${folderId}`);
      if (response.ok) {
        const breadcrumbData = await response.json();
        setBreadcrumb(breadcrumbData);
      }
    } catch (err) {
      console.error('Breadcrumb fetch error:', err);
    }
  };

  const toggleStar = async (assetId, currentStarred) => {
    try {
      const response = await fetch(`${API_BASE_URL}/assets/${assetId}/star`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !currentStarred })
      });

      if (!response.ok) throw new Error('Failed to update star status');
      await fetchAssets();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleShare = async (assetId, currentShared) => {
    try {
      const response = await fetch(`${API_BASE_URL}/assets/${assetId}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shared: !currentShared })
      });

      if (!response.ok) throw new Error('Failed to update share status');
      await fetchAssets();
    } catch (err) {
      setError(err.message);
    }
  };

  const duplicateAsset = async (assetId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/assets/${assetId}/duplicate`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to duplicate asset');
      await fetchAssets();
      setSuccess('Asset duplicated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteAsset = async (assetId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/assets/${assetId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete asset');
      await fetchAssets();
      await fetchStats();
      setSuccess('Asset deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const exportToExcel = async () => {
    try {
      setExporting(true);
      const response = await fetch(`${API_BASE_URL}/assets/export/excel`);
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Incubrix_Drive_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      setSuccess('Export completed successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const clearAllData = async () => {
    try {
      setClearing(true);
      const response = await fetch(`${API_BASE_URL}/assets/clear-all`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to clear data');
      
      await Promise.all([fetchAssets(), fetchStats()]);
      setSuccess('All data cleared successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  };

  // File Upload Handler
  const handleFileUpload = async (files, isFolder = false) => {
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      const formData = new FormData();
      
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      
      formData.append('uploaded_by', 'user@incubrix.com');
      formData.append('parentFolderId', currentFolderId);
      formData.append('isFolder', isFolder.toString());

      const response = await fetch(`${API_BASE_URL}/assets/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      await Promise.all([fetchAssets(), fetchStats()]);
      
      setSuccess(`Upload completed! ${result.assets.length} items uploaded.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  // Drag and Drop Handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev + 1);
    if (dragCounter === 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragCounter(prev => prev - 1);
    if (dragCounter === 1) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setDragCounter(0);
    
    const items = e.dataTransfer.items;
    const files = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  // Context Menu Handler
  const handleContextMenu = (e, asset) => {
    e.preventDefault();
    setContextMenu({
      asset,
      x: e.clientX,
      y: e.clientY
    });
  };

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return asset.name.toLowerCase().includes(query) ||
               (asset.description && asset.description.toLowerCase().includes(query));
      }
      return true;
    });
  }, [assets, searchQuery]);

  // Context Menu Component
  const ContextMenu = ({ asset, x, y, onClose }) => {
    const menuRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          onClose();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleAction = (action) => {
      onClose();
      
      switch (action) {
        case 'open':
          openFile(asset);
          break;
        case 'preview':
          if (asset.preview_available) {
            setPreviewModal(asset);
          }
          break;
        case 'download':
          if (!asset.is_folder) {
            const link = document.createElement('a');
            link.href = `${API_BASE_URL}/assets/file/${asset.id}`;
            link.download = asset.name;
            link.click();
          }
          break;
        case 'star':
          toggleStar(asset.id, asset.starred);
          break;
        case 'share':
          toggleShare(asset.id, asset.shared);
          break;
        case 'rename':
          setRenameModal(asset);
          break;
        case 'duplicate':
          duplicateAsset(asset.id);
          break;
        case 'rss':
          if (asset.is_folder) {
            setFolderRssModal(asset);
          } else {
            setEditingRssAsset(asset);
          }
          break;
        case 'info':
          setSelectedAsset(asset);
          break;
        case 'delete':
          setDeleteConfirmation(asset);
          break;
      }
    };

    return (
      <div
        ref={menuRef}
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-48"
        style={{ left: x, top: y }}
      >
        <button
          onClick={() => handleAction('open')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          {asset.is_folder ? <FolderOpen className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
          <span>Open</span>
        </button>
        
        {asset.preview_available && (
          <button
            onClick={() => handleAction('preview')}
            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>
        )}
        
        {!asset.is_folder && (
          <button
            onClick={() => handleAction('download')}
            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        )}
        
        <div className="border-t border-gray-100 my-2" />
        
        <button
          onClick={() => handleAction('star')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          <Star className={`w-4 h-4 ${asset.starred ? 'text-yellow-500 fill-current' : ''}`} />
          <span>{asset.starred ? 'Unstar' : 'Star'}</span>
        </button>
        
        <button
          onClick={() => handleAction('share')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          <Share className="w-4 h-4" />
          <span>{asset.shared ? 'Unshare' : 'Share'}</span>
        </button>
        
        <button
          onClick={() => handleAction('rename')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          <Edit3 className="w-4 h-4" />
          <span>Rename</span>
        </button>
        
        {!asset.is_folder && (
          <button
            onClick={() => handleAction('duplicate')}
            className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
          >
            <Copy className="w-4 h-4" />
            <span>Duplicate</span>
          </button>
        )}
        
        <button
          onClick={() => handleAction('rss')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          <Rss className="w-4 h-4" />
          <span>{asset.is_folder ? 'Folder RSS' : 'RSS Properties'}</span>
        </button>
        
        <div className="border-t border-gray-100 my-2" />
        
        <button
          onClick={() => handleAction('info')}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
        >
          <Info className="w-4 h-4" />
          <span>Details</span>
        </button>
        
        <button
          onClick={() => handleAction('delete')}
          className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center space-x-3"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete</span>
        </button>
      </div>
    );
  };

  // Modal Components
  const NewFolderModal = () => {
    const [folderName, setFolderName] = useState('');
    const [folderColor, setFolderColor] = useState('#1a73e8');
    const [folderDescription, setFolderDescription] = useState('');

    const handleCreate = async () => {
      if (!folderName.trim()) return;

      try {
        const response = await fetch(`${API_BASE_URL}/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: folderName.trim(),
            parent_folder_id: currentFolderId,
            color: folderColor,
            description: folderDescription.trim() || null,
            uploaded_by: 'user@incubrix.com'
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create folder');
        }

        await fetchAssets();
        setNewFolderModal(false);
        setFolderName('');
        setFolderDescription('');
        setSuccess('Folder created successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err.message);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">New Folder</h2>
            <button
              onClick={() => setNewFolderModal(false)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Folder Name</label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter folder name"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <div className="flex space-x-2">
                {['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9c27b0', '#ff6d01', '#795548'].map(color => (
                  <button
                    key={color}
                    onClick={() => setFolderColor(color)}
                    className={`w-8 h-8 rounded-full border-2 ${folderColor === color ? 'border-gray-400' : 'border-gray-200'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
              <textarea
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter folder description"
                rows={3}
              />
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <button
              onClick={() => setNewFolderModal(false)}
              className="flex-1 px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!folderName.trim()}
              className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    );
  };

  const RenameModal = ({ asset, onClose }) => {
    const [newName, setNewName] = useState(asset?.name || '');

    const handleRename = async () => {
      if (!newName.trim() || newName === asset.name) {
        onClose();
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/assets/${asset.id}/rename`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName.trim() })
        });

        if (!response.ok) {
          throw new Error('Failed to rename');
        }

        await fetchAssets();
        setSuccess('Item renamed successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err.message);
      }
      
      onClose();
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Rename</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter new name"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleRename()}
              />
            </div>
          </div>
          
          <div className="flex space-x-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              disabled={!newName.trim()}
              className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    );
  };

  // YouTube Studio Compatible Public Feed Modal
  const PublicFeedModal = () => {
    const [feedData, setFeedData] = useState({
      feed_name: '',
      feed_description: '',
      feed_slug: '',
      filter_type: 'all',
      filter_value: '',
      folder_id: 'root'
    });

    const handleSave = async () => {
      try {
        const method = editingPublicFeed ? 'PUT' : 'POST';
        const url = editingPublicFeed 
          ? `${API_BASE_URL}/rss/feeds/${editingPublicFeed.id}`
          : `${API_BASE_URL}/rss/feeds`;

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(feedData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save feed');
        }

        await fetchPublicFeeds();
        setPublicFeedModal(false);
        setEditingPublicFeed(null);
        setSuccess(`Public RSS feed ${editingPublicFeed ? 'updated' : 'created'} successfully!`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err.message);
      }
    };

    const generateSlug = (name) => {
      return name.toLowerCase()
        .replace(/[^a-z0-9 -]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
    };

    useEffect(() => {
      if (editingPublicFeed) {
        setFeedData({
          feed_name: editingPublicFeed.feed_name || '',
          feed_description: editingPublicFeed.feed_description || '',
          feed_slug: editingPublicFeed.feed_slug || '',
          filter_type: editingPublicFeed.filter_type || 'all',
          filter_value: editingPublicFeed.filter_value || '',
          folder_id: editingPublicFeed.folder_id || 'root'
        });
      }
    }, [editingPublicFeed]);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Youtube className="w-6 h-6 mr-2 text-red-600" />
                {editingPublicFeed ? 'Edit' : 'Create'} YouTube Studio Compatible Feed
              </h2>
              <p className="text-sm text-gray-500">Configure a public RSS feed for YouTube Studio integration</p>
            </div>
            <button
              onClick={() => {
                setPublicFeedModal(false);
                setEditingPublicFeed(null);
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Feed Name *</label>
                <input
                  type="text"
                  value={feedData.feed_name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFeedData({
                      ...feedData,
                      feed_name: name,
                      feed_slug: feedData.feed_slug || generateSlug(name)
                    });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="My Podcast Feed"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Feed Slug *</label>
                <input
                  type="text"
                  value={feedData.feed_slug}
                  onChange={(e) => setFeedData({...feedData, feed_slug: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="my-podcast-feed"
                />
                <p className="text-xs text-gray-500 mt-1">URL-safe slug (lowercase, numbers, hyphens only)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={feedData.feed_description}
                onChange={(e) => setFeedData({...feedData, feed_description: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Describe your podcast or content feed"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter Type</label>
                <select
                  value={feedData.filter_type}
                  onChange={(e) => setFeedData({...feedData, filter_type: e.target.value, filter_value: ''})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All RSS Items</option>
                  <option value="folder">Specific Folder</option>
                  <option value="type">File Type</option>
                  <option value="tags">Tags</option>
                </select>
              </div>

              {feedData.filter_type !== 'all' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter Value</label>
                  {feedData.filter_type === 'type' ? (
                    <select
                      value={feedData.filter_value}
                      onChange={(e) => setFeedData({...feedData, filter_value: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Type</option>
                      <option value="audio">Audio</option>
                      <option value="video">Video</option>
                      <option value="image">Image</option>
                      <option value="text">Documents</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={feedData.filter_value}
                      onChange={(e) => setFeedData({...feedData, filter_value: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={feedData.filter_type === 'tags' ? 'Enter tag to filter by' : 'Enter filter value'}
                    />
                  )}
                </div>
              )}
            </div>

            {feedData.feed_slug && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Feed URLs</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between bg-white p-2 rounded border">
                    <code className="text-blue-600">
                      {window.location.protocol}//{window.location.host}/feeds/{feedData.feed_slug}
                    </code>
                    <button
                      onClick={() => copyRssFeedUrl(null, feedData.feed_slug)}
                      className="p-1 text-blue-500 hover:text-blue-700"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
            <button
              onClick={() => {
                setPublicFeedModal(false);
                setEditingPublicFeed(null);
              }}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!feedData.feed_name || !feedData.feed_slug}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
            >
              <Youtube className="w-4 h-4" />
              <span>{editingPublicFeed ? 'Update' : 'Create'} Feed</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // RSS Asset Editor with YouTube Studio fields
  const RssAssetEditor = ({ asset, onClose }) => {
    const [rssData, setRssData] = useState({
      include_in_rss: asset?.include_in_rss || false,
      rss_title: asset?.rss_title || asset?.name || '',
      rss_description: asset?.rss_description || '',
      rss_category: asset?.rss_category || asset?.primary_type || '',
      rss_publish_date: asset?.rss_publish_date ? new Date(asset.rss_publish_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      rss_guid: asset?.rss_guid || asset?.id || ''
    });

    const handleSave = () => {
      updateAssetRss(asset.id, rssData);
      onClose();
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Youtube className="w-6 h-6 mr-2 text-red-600" />
                YouTube Studio RSS Properties
              </h2>
              <p className="text-sm text-gray-500">{asset?.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="include_in_rss"
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                checked={rssData.include_in_rss}
                onChange={(e) => setRssData({...rssData, include_in_rss: e.target.checked})}
              />
              <label htmlFor="include_in_rss" className="text-sm font-medium text-gray-700">
                Include this file in RSS feed (YouTube Studio compatible)
              </label>
            </div>

            {rssData.include_in_rss && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">RSS Title</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={rssData.rss_title}
                      onChange={(e) => setRssData({...rssData, rss_title: e.target.value})}
                      placeholder="Episode title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={rssData.rss_category}
                      onChange={(e) => setRssData({...rssData, rss_category: e.target.value})}
                      placeholder="Content category"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">RSS Description</label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    value={rssData.rss_description}
                    onChange={(e) => setRssData({...rssData, rss_description: e.target.value})}
                    placeholder="Episode description or summary"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Publish Date</label>
                    <input
                      type="datetime-local"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={rssData.rss_publish_date}
                      onChange={(e) => setRssData({...rssData, rss_publish_date: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">GUID</label>
                    <input
                      type="text"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={rssData.rss_guid}
                      onChange={(e) => setRssData({...rssData, rss_guid: e.target.value})}
                      placeholder="Unique identifier"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                    <Info className="w-4 h-4 mr-2" />
                    YouTube Studio Preview
                  </h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p><strong>Title:</strong> {rssData.rss_title}</p>
                    <p><strong>Description:</strong> {rssData.rss_description || 'No description provided'}</p>
                    <p><strong>Category:</strong> {rssData.rss_category}</p>
                    <p><strong>URL:</strong> {rssSettings?.site_url}/api/assets/file/{asset?.id}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loadingRss}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
            >
              {loadingRss ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Youtube className="w-4 h-4" />
              )}
              <span>Update RSS</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // RSS Settings Modal with YouTube Studio fields and Author/Owner fields
  const RssSettingsModal = () => {
    const [settings, setSettings] = useState({
      site_title: 'Incubrix CMS',
      site_description: 'Content Management System RSS Feed',
      site_url: 'http://localhost:3001',
      rss_title: 'Incubrix CMS Feed',
      rss_description: 'Latest content from Incubrix CMS',
      language: 'en-us',
      max_items: 20,
      auto_include_new_content: false,
      author_name: '',
      author_email: '',
      owner_name: '',
      owner_email: ''
    });

    const handleSave = () => {
      updateRssSettings(settings);
      setRssSettingsModal(false);
    };

    useEffect(() => {
      if (rssSettings) {
        setSettings({
          site_title: rssSettings.site_title || 'Incubrix CMS',
          site_description: rssSettings.site_description || 'Content Management System RSS Feed',
          site_url: rssSettings.site_url || 'http://localhost:3001',
          rss_title: rssSettings.rss_title || 'Incubrix CMS Feed',
          rss_description: rssSettings.rss_description || 'Latest content from Incubrix CMS',
          language: rssSettings.language || 'en-us',
          max_items: rssSettings.max_items || 20,
          auto_include_new_content: rssSettings.auto_include_new_content || false,
          author_name: rssSettings.author_name || '',
          author_email: rssSettings.author_email || '',
          owner_name: rssSettings.owner_name || '',
          owner_email: rssSettings.owner_email || ''
        });
      }
    }, [rssSettings]);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Youtube className="w-6 h-6 mr-2 text-red-600" />
                YouTube Studio Compatible RSS Settings
              </h2>
              <p className="text-sm text-gray-500">Configure your RSS feed for YouTube Studio integration</p>
            </div>
            <button
              onClick={() => setRssSettingsModal(false)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Site Title</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.site_title}
                    onChange={(e) => setSettings({...settings, site_title: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Site URL</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.site_url}
                    onChange={(e) => setSettings({...settings, site_url: e.target.value})}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Site Description</label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  value={settings.site_description}
                  onChange={(e) => setSettings({...settings, site_description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">RSS Feed Title</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.rss_title}
                    onChange={(e) => setSettings({...settings, rss_title: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                  <select
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.language}
                    onChange={(e) => setSettings({...settings, language: e.target.value})}
                  >
                    <option value="en-us">English (US)</option>
                    <option value="en-gb">English (UK)</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">RSS Feed Description</label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  value={settings.rss_description}
                  onChange={(e) => setSettings({...settings, rss_description: e.target.value})}
                />
              </div>
            </div>

            {/* NEW: Author/Owner Information Section for YouTube Studio */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Youtube className="w-5 h-5 mr-2 text-red-600" />
                YouTube Studio Author/Owner Information
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                These fields are required for YouTube Studio RSS feed verification. Use the same email address that you use for your YouTube account.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Author Name *
                    <span className="text-xs text-gray-500 block">Your name or channel name</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.author_name}
                    onChange={(e) => setSettings({...settings, author_name: e.target.value})}
                    placeholder="John Doe"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Author Email *
                    <span className="text-xs text-gray-500 block">Your email address (same as YouTube)</span>
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.author_email}
                    onChange={(e) => setSettings({...settings, author_email: e.target.value})}
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Owner Name *
                    <span className="text-xs text-gray-500 block">Usually same as author name</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.owner_name}
                    onChange={(e) => setSettings({...settings, owner_name: e.target.value})}
                    placeholder="John Doe"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Owner Email *
                    <span className="text-xs text-gray-500 block">Your email address (same as YouTube)</span>
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.owner_email}
                    onChange={(e) => setSettings({...settings, owner_email: e.target.value})}
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-lg mt-4">
                <h4 className="font-medium text-red-900 mb-2 flex items-center">
                  <Info className="w-4 h-4 mr-2" />
                  YouTube Studio Requirements
                </h4>
                <ul className="text-sm text-red-800 space-y-1">
                  <li>â€¢ Author and Owner emails must match your YouTube account email</li>
                  <li>â€¢ Names should match your channel name or real name</li>
                  <li>â€¢ These fields are required for podcast verification in YouTube Studio</li>
                  <li>â€¢ Keep this information consistent across all your RSS feeds</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">General Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Items in Feed</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={settings.max_items}
                    onChange={(e) => setSettings({...settings, max_items: parseInt(e.target.value)})}
                  />
                </div>

                <div className="flex items-center space-x-3 pt-8">
                  <input
                    type="checkbox"
                    id="auto_include"
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    checked={settings.auto_include_new_content}
                    onChange={(e) => setSettings({...settings, auto_include_new_content: e.target.checked})}
                  />
                  <label htmlFor="auto_include" className="text-sm font-medium text-gray-700">
                    Auto-include new uploads in RSS
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">RSS Feed URLs:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between bg-white p-2 rounded border">
                  <code className="text-gray-600">{settings.site_url}/api/rss/feed</code>
                  <button
                    onClick={() => copyRssFeedUrl()}
                    className="p-1 text-gray-500 hover:text-gray-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between bg-white p-2 rounded border">
                  <code className="text-gray-600">{settings.site_url}/rss</code>
                  <button
                    onClick={() => copyRssFeedUrl()}
                    className="p-1 text-gray-500 hover:text-gray-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
            <button
              onClick={() => setRssSettingsModal(false)}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loadingRss}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
            >
              {loadingRss ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Youtube className="w-4 h-4" />
              )}
              <span>Save Settings</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Confirmation Dialog Component
  const ConfirmationDialog = ({ title, message, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700">{message}</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );

  // Delete Confirmation Modal
  const DeleteConfirmationModal = ({ asset, onClose }) => {
    const handleDelete = () => {
      deleteAsset(asset.id);
      onClose();
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-red-600">Delete {asset.is_folder ? 'Folder' : 'File'}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-700">
              Are you sure you want to delete <strong>{asset.name}</strong>?
              {asset.is_folder && ' This will also delete all contents within the folder.'}
            </p>
            <p className="text-red-600 text-sm mt-2">This action cannot be undone.</p>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  // File Preview Modal Component
  const FilePreviewModal = ({ asset, onClose }) => {
    const [previewData, setPreviewData] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(true);

    useEffect(() => {
      if (asset && asset.preview_available) {
        fetchPreview();
      } else {
        setLoadingPreview(false);
      }
    }, [asset]);

    const fetchPreview = async () => {
      try {
        setLoadingPreview(true);
        const response = await fetch(`${API_BASE_URL}/assets/${asset.id}/preview`);
        if (response.ok) {
          const data = await response.json();
          setPreviewData(data);
        }
      } catch (error) {
        console.error('Preview fetch error:', error);
      } finally {
        setLoadingPreview(false);
      }
    };

    const renderPreview = () => {
      if (loadingPreview) {
        return (
          <div className="flex items-center justify-center h-96">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        );
      }

      if (!previewData) {
        return (
          <div className="flex flex-col items-center justify-center h-96 text-gray-500">
            <Eye className="w-16 h-16 mb-4" />
            <p>Preview not available for this file type</p>
          </div>
        );
      }

      switch (previewData.type) {
        case 'text':
          return (
            <div className="max-h-96 overflow-auto">
              <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg font-mono">
                {previewData.content}
              </pre>
              {previewData.truncated && (
                <p className="text-sm text-orange-600 mt-2 text-center">Content truncated - download full file to view complete content</p>
              )}
            </div>
          );
        
        case 'image':
          return (
            <div className="flex justify-center">
              <img 
                src={previewData.url} 
                alt={asset.name}
                className="max-h-96 max-w-full object-contain rounded-lg shadow-lg"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div className="hidden text-center text-gray-500">
                <Image className="w-16 h-16 mx-auto mb-2" />
                <p>Image could not be loaded</p>
              </div>
            </div>
          );
        
        case 'video':
          return (
            <div className="flex justify-center">
              <video 
                controls 
                className="max-h-96 max-w-full rounded-lg shadow-lg"
                preload="metadata"
              >
                <source src={previewData.url} type={previewData.mimeType} />
                Your browser does not support video playback.
              </video>
            </div>
          );
        
        case 'audio':
          return (
            <div className="flex flex-col items-center justify-center h-48">
              <Music className="w-16 h-16 text-green-500 mb-4" />
              <audio controls className="w-full max-w-md">
                <source src={previewData.url} type={previewData.mimeType} />
                Your browser does not support audio playback.
              </audio>
            </div>
          );
        
        default:
          return (
            <div className="flex flex-col items-center justify-center h-96 text-gray-500">
              <File className="w-16 h-16 mb-4" />
              <p>Preview not supported for this file type</p>
            </div>
          );
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-3">
              {getTypeIcon(asset.primary_type, asset.format, 'small')}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{asset.name}</h2>
                <p className="text-sm text-gray-500">
                  {formatFileSize(asset.size_bytes)} â€¢ {asset.primary_type} â€¢ Modified {new Date(asset.modified_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => window.open(`${API_BASE_URL}/assets/file/${asset.id}`, '_blank')}
                className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = `${API_BASE_URL}/assets/file/${asset.id}`;
                  link.download = asset.name;
                  link.click();
                }}
                className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {renderPreview()}
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Folder RSS Management Modal
  const FolderRssModal = ({ folder, onClose }) => {
    const [folderRssSettings, setFolderRssSettings] = useState({
      include_folder_in_rss: false,
      rss_title: folder?.name || '',
      rss_description: folder?.description || '',
      auto_include_new_files: false,
      category: 'Technology',
      subcategory: 'Software How-To',
      explicit: false
    });

    useEffect(() => {
      if (folder) {
        fetchFolderRssSettings();
      }
    }, [folder]);

    const fetchFolderRssSettings = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/rss/folder/${folder.id}/settings`);
        if (response.ok) {
          const data = await response.json();
          setFolderRssSettings(data);
        }
      } catch (error) {
        console.error('Failed to fetch folder RSS settings:', error);
      }
    };

    const saveFolderRssSettings = async () => {
      try {
        setLoadingRss(true);
        const response = await fetch(`${API_BASE_URL}/rss/folder/${folder.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(folderRssSettings)
        });

        if (!response.ok) {
          throw new Error('Failed to update folder RSS settings');
        }

        setSuccess('Folder RSS settings updated successfully!');
        setTimeout(() => setSuccess(null), 3000);
        onClose();
      } catch (error) {
        setError(error.message);
      } finally {
        setLoadingRss(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                <Youtube className="w-6 h-6 mr-2 text-red-600" />
                Folder RSS Settings
              </h2>
              <p className="text-sm text-gray-500">{folder?.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="include_folder_in_rss"
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                checked={folderRssSettings.include_folder_in_rss}
                onChange={(e) => setFolderRssSettings({...folderRssSettings, include_folder_in_rss: e.target.checked})}
              />
              <label htmlFor="include_folder_in_rss" className="text-sm font-medium text-gray-700">
                Include this folder's files in RSS feed
              </label>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="auto_include_new_files"
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                checked={folderRssSettings.auto_include_new_files}
                onChange={(e) => setFolderRssSettings({...folderRssSettings, auto_include_new_files: e.target.checked})}
              />
              <label htmlFor="auto_include_new_files" className="text-sm font-medium text-gray-700">
                Automatically include new files uploaded to this folder
              </label>
            </div>

            {folderRssSettings.include_folder_in_rss && (
              <div className="space-y-4 pl-7">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">RSS Title</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={folderRssSettings.rss_title}
                    onChange={(e) => setFolderRssSettings({...folderRssSettings, rss_title: e.target.value})}
                    placeholder="Title for RSS feed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">RSS Description</label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    value={folderRssSettings.rss_description}
                    onChange={(e) => setFolderRssSettings({...folderRssSettings, rss_description: e.target.value})}
                    placeholder="Description for RSS feed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={folderRssSettings.category}
                      onChange={(e) => setFolderRssSettings({...folderRssSettings, category: e.target.value})}
                    >
                      <option value="Technology">Technology</option>
                      <option value="Education">Education</option>
                      <option value="Business">Business</option>
                      <option value="Arts">Arts</option>
                      <option value="Comedy">Comedy</option>
                      <option value="Health & Fitness">Health & Fitness</option>
                      <option value="Music">Music</option>
                      <option value="News">News</option>
                      <option value="Science">Science</option>
                      <option value="Sports">Sports</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subcategory</label>
                    <select
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={folderRssSettings.subcategory}
                      onChange={(e) => setFolderRssSettings({...folderRssSettings, subcategory: e.target.value})}
                    >
                      <option value="Software How-To">Software How-To</option>
                      <option value="Tech News">Tech News</option>
                      <option value="Courses">Courses</option>
                      <option value="How To">How To</option>
                      <option value="Self-Improvement">Self-Improvement</option>
                      <option value="Entrepreneurship">Entrepreneurship</option>
                      <option value="Marketing">Marketing</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="folder_explicit"
                    checked={folderRssSettings.explicit}
                    onChange={(e) => setFolderRssSettings({...folderRssSettings, explicit: e.target.checked})}
                    className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                  />
                  <label htmlFor="folder_explicit" className="text-sm font-medium text-gray-700">
                    Contains explicit content
                  </label>
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                <Info className="w-4 h-4 mr-2" />
                RSS Actions
              </h4>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => window.open(`${API_BASE_URL}/rss/folder/${folder.id}/feed`, '_blank')}
                  className="flex items-center space-x-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Feed</span>
                </button>
                
                <button
                  onClick={() => copyRssFeedUrl(folder.id)}
                  className="flex items-center space-x-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Feed URL</span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveFolderRssSettings}
              disabled={loadingRss}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center space-x-2"
            >
              {loadingRss ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Rss className="w-4 h-4" />
              )}
              <span>Update RSS</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Initialize data on mount
  useEffect(() => {
    fetchAssets();
    fetchStats();
    fetchRssSettings();
    fetchPublicFeeds();
    fetchAnalytics();
  }, [fetchAssets, fetchStats, fetchRssSettings, fetchPublicFeeds, fetchAnalytics]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'u':
            e.preventDefault();
            fileInputRef.current?.click();
            break;
          case 'k':
            e.preventDefault();
            setNewFolderModal(true);
            break;
        }
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        setSelectedAsset(null);
        setPreviewModal(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside handler for context menu
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Render main content based on active tab
  const renderMainContent = () => {
    switch (activeTab) {
      case 'library':
        return (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-gray-900">My Drive</h1>
                  {stats && (
                    <div className="text-sm text-gray-500">
                      {stats.total_files} files â€¢ {stats.total_folders} folders â€¢ {formatFileSize(stats.total_size)}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {view === 'grid' ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={fetchAssets}
                    disabled={loading}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Breadcrumb */}
              <nav className="flex items-center space-x-2 text-sm mb-4">
                {breadcrumb.map((item, index) => (
                  <div key={item.id} className="flex items-center">
                    {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400 mx-2" />}
                    <button
                      onClick={() => navigateToFolder(item.id)}
                      className={`px-2 py-1 rounded hover:bg-gray-100 transition-colors ${
                        index === breadcrumb.length - 1 ? 'text-blue-600 font-medium' : 'text-gray-600'
                      }`}
                    >
                      {item.name}
                    </button>
                  </div>
                ))}
              </nav>

              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>Upload Files</span>
                  </button>
                  
                  <button
                    onClick={() => setNewFolderModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>New Folder</span>
                  </button>

                  <div className="h-8 w-px bg-gray-300" />

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="modified_at">Last Modified</option>
                    <option value="name">Name</option>
                    <option value="size_bytes">Size</option>
                    <option value="uploaded_at">Upload Date</option>
                  </select>

                  <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                    {['all', 'text', 'image', 'video', 'audio'].map(type => (
                      <button
                        key={type}
                        onClick={() => setFilters(prev => ({ ...prev, primary_type: type }))}
                        className={`px-3 py-1 rounded-md text-sm capitalize transition-colors ${
                          filters.primary_type === type 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search files and folders..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, starred: !prev.starred }))}
                      className={`p-2 rounded-lg transition-colors ${
                        filters.starred ? 'bg-yellow-100 text-yellow-600' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      title="Show starred only"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, shared: !prev.shared }))}
                      className={`p-2 rounded-lg transition-colors ${
                        filters.shared ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'
                      }`}
                      title="Show shared only"
                    >
                      <Share className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area with Drag & Drop */}
            <div 
              className={`flex-1 p-6 ${isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-300' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {/* First Time Welcome */}
              {isFirstTime && (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <div className="w-32 h-32 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                    <HardDrive className="w-16 h-16 text-blue-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Incubrix CMS</h2>
                  <p className="text-gray-600 mb-6 max-w-md">
                    Get started by uploading your first files or creating folders to organize your content.
                  </p>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center space-x-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      <span>Upload Files</span>
                    </button>
                    <button
                      onClick={() => setNewFolderModal(true)}
                      className="flex items-center space-x-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <FolderPlus className="w-5 h-5" />
                      <span>Create Folder</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Loading State */}
              {loading && !isFirstTime && (
                <div className="flex items-center justify-center h-64">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              )}

              {/* Asset Grid/List */}
              {!loading && !isFirstTime && (
                <>
                  {isDragging && (
                    <div className="absolute inset-0 bg-blue-50 bg-opacity-75 flex items-center justify-center z-10 border-2 border-dashed border-blue-300 rounded-lg">
                      <div className="text-center">
                        <Upload className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                        <p className="text-xl font-semibold text-blue-700">Drop files here to upload</p>
                      </div>
                    </div>
                  )}

                  {filteredAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <File className="w-12 h-12 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
                      <p className="text-gray-500">
                        {searchQuery ? 'Try adjusting your search terms.' : 'This folder is empty.'}
                      </p>
                    </div>
                  ) : (
                    <div className={view === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4' : 'space-y-1'}>
                      {filteredAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className={`group ${view === 'grid' 
                            ? 'bg-white rounded-xl p-4 hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-100 hover:border-gray-200' 
                            : 'flex items-center p-3 hover:bg-gray-50 rounded-lg cursor-pointer'
                          }`}
                          onClick={() => openFile(asset)}
                          onContextMenu={(e) => handleContextMenu(e, asset)}
                        >
                          {view === 'grid' ? (
                            <>
                              <div className="flex flex-col items-center text-center">
                                <div className="relative mb-3">
                                  {getTypeIcon(asset.primary_type, asset.format)}
                                  {asset.starred && (
                                    <Star className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500 fill-current" />
                                  )}
                                  {asset.shared && (
                                    <Share className="absolute -top-1 -left-1 w-4 h-4 text-blue-500" />
                                  )}
                                  {asset.include_in_rss && (
                                    <Rss className="absolute -bottom-1 -right-1 w-4 h-4 text-orange-500" />
                                  )}
                                </div>
                                <h3 className="text-sm font-medium text-gray-900 truncate w-full mb-1">
                                  {asset.name}
                                </h3>
                                <div className="text-xs text-gray-500 space-y-1">
                                  {!asset.is_folder && (
                                    <div>{formatFileSize(asset.size_bytes)}</div>
                                  )}
                                  {asset.duration_seconds && (
                                    <div>{formatDuration(asset.duration_seconds)}</div>
                                  )}
                                  <div>{new Date(asset.modified_at).toLocaleDateString()}</div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center min-w-0 flex-1">
                                <div className="flex-shrink-0 mr-4">
                                  {getTypeIcon(asset.primary_type, asset.format, 'small')}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center">
                                    <h3 className="text-sm font-medium text-gray-900 truncate">
                                      {asset.name}
                                    </h3>
                                    <div className="flex items-center ml-2 space-x-1">
                                      {asset.starred && (
                                        <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                      )}
                                      {asset.shared && (
                                        <Share className="w-3 h-3 text-blue-500" />
                                      )}
                                      {asset.include_in_rss && (
                                        <Rss className="w-3 h-3 text-orange-500" />
                                      )}
                                    </div>
                                  </div>
                                  {asset.description && (
                                    <p className="text-xs text-gray-500 truncate">{asset.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-8 text-sm text-gray-500">
                                <div className="w-20 text-right">
                                  {asset.is_folder ? 'Folder' : formatFileSize(asset.size_bytes)}
                                </div>
                                <div className="w-32 text-right">
                                  {new Date(asset.modified_at).toLocaleDateString()}
                                </div>
                                <div className="w-24 text-right">
                                  {asset.duration_seconds && formatDuration(asset.duration_seconds)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );

      case 'rss':
        return (
          <div className="flex-1 p-6">
            <div className="max-w-6xl mx-auto">
              {/* RSS Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                    <Youtube className="w-8 h-8 mr-3 text-red-600" />
                    YouTube Studio RSS Management
                  </h1>
                  <p className="text-gray-600 mt-2">
                    Manage RSS feeds for YouTube Studio integration and podcast distribution
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setRssSettingsModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>RSS Settings</span>
                  </button>
                  <button
                    onClick={() => setPublicFeedModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Public Feed</span>
                  </button>
                </div>
              </div>

              {/* RSS Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="p-3 bg-orange-100 rounded-xl">
                      <Rss className="w-6 h-6 text-orange-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-sm font-medium text-gray-500">RSS Items</h3>
                      <p className="text-2xl font-bold text-gray-900">{stats?.total_rss_items || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="p-3 bg-red-100 rounded-xl">
                      <Youtube className="w-6 h-6 text-red-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-sm font-medium text-gray-500">Public Feeds</h3>
                      <p className="text-2xl font-bold text-gray-900">{publicFeeds.length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center">
                    <div className="p-3 bg-green-100 rounded-xl">
                      <Globe className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-sm font-medium text-gray-500">Global Feed</h3>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => window.open(`${API_BASE_URL}/rss/feed`, '_blank')}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          View
                        </button>
                        <span className="text-gray-300">â€¢</span>
                        <button
                          onClick={() => copyRssFeedUrl()}
                          className="text-sm text-green-600 hover:text-green-800"
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Public Feeds Section */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-8">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                    <Youtube className="w-5 h-5 mr-2 text-red-600" />
                    Public RSS Feeds for YouTube Studio
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Create custom RSS feeds for external platform integration
                  </p>
                </div>
                <div className="p-6">
                  {publicFeeds.length === 0 ? (
                    <div className="text-center py-12">
                      <Youtube className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No public feeds yet</h3>
                      <p className="text-gray-500 mb-6">Create your first RSS feed for YouTube Studio integration</p>
                      <button
                        onClick={() => setPublicFeedModal(true)}
                        className="flex items-center space-x-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors mx-auto"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Create Feed</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {publicFeeds.map((feed) => (
                        <div key={feed.id} className="border border-gray-200 rounded-xl p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">{feed.feed_name}</h3>
                                <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                                  {feed.filter_type}
                                </span>
                              </div>
                              <p className="text-gray-600 mb-3">{feed.feed_description}</p>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                  <span className="text-gray-500">RSS Feed:</span>
                                  <div className="flex items-center space-x-2">
                                    <code className="text-xs text-blue-600">{feed.feed_slug}</code>
                                    <button
                                      onClick={() => copyRssFeedUrl(null, feed.feed_slug)}
                                      className="p-1 text-blue-500 hover:text-blue-700"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                  <span className="text-gray-500">JSON Feed:</span>
                                  <div className="flex items-center space-x-2">
                                    <code className="text-xs text-green-600">{feed.feed_slug}.json</code>
                                    <button
                                      onClick={() => navigator.clipboard.writeText(`${window.location.protocol}//${window.location.host}/feeds/${feed.feed_slug}.json`)}
                                      className="p-1 text-green-500 hover:text-green-700"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                  <span className="text-gray-500">Created:</span>
                                  <span className="text-xs">{new Date(feed.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 ml-4">
                              <button
                                onClick={() => window.open(feed.public_url, '_blank')}
                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Feed"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingPublicFeed(feed);
                                  setPublicFeedModal(true);
                                }}
                                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                                title="Edit Feed"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setConfirmDialog({
                                    title: 'Delete Feed',
                                    message: 'Are you sure you want to delete this feed? This action cannot be undone.',
                                    onConfirm: async () => {
                                      try {
                                        const response = await fetch(`${API_BASE_URL}/rss/feeds/${feed.id}`, {
                                          method: 'DELETE'
                                        });
                                        if (response.ok) {
                                          await fetchPublicFeeds();
                                          setSuccess('Feed deleted successfully!');
                                          setTimeout(() => setSuccess(null), 3000);
                                        }
                                      } catch (err) {
                                        setError('Failed to delete feed');
                                      }
                                      setConfirmDialog(null);
                                    },
                                    onCancel: () => setConfirmDialog(null)
                                  });
                                }}
                                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Feed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RSS Preview */}
              {rssPreview && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">RSS Feed Preview</h2>
                    <p className="text-gray-600 mt-1">Latest items in your global RSS feed</p>
                  </div>
                  <div className="p-6">
                    {rssPreview.items?.length === 0 ? (
                      <div className="text-center py-8">
                        <Rss className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No RSS items yet. Mark some files to include in RSS.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {rssPreview.items?.slice(0, 5).map((item) => (
                          <div key={item.id} className="flex items-start space-x-4 p-4 border border-gray-200 rounded-xl">
                            <div className="flex-shrink-0">
                              {getTypeIcon(item.primary_type, item.format, 'small')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-medium text-gray-900">{item.rss_title || item.name}</h3>
                              <p className="text-gray-600 text-sm mt-1">{item.rss_description || 'No description'}</p>
                              <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                                <span>Category: {item.rss_category || item.primary_type}</span>
                                <span>â€¢</span>
                                <span>{formatFileSize(item.size_bytes)}</span>
                                <span>â€¢</span>
                                <span>{new Date(item.rss_publish_date || item.uploaded_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setEditingRssAsset(item)}
                                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit RSS Properties"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => window.open(item.item_url, '_blank')}
                                className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                                title="View File"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'analytics':
        return (
          <div className="flex-1 p-6">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                  <BarChart3 className="w-8 h-8 mr-3 text-blue-600" />
                  Analytics Dashboard
                </h1>
                <p className="text-gray-600 mt-2">Track your content management and RSS feed performance</p>
              </div>

              {/* Stats Overview */}
              {analyticsData.overview && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center">
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <File className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-sm font-medium text-gray-500">Total Files</h3>
                        <p className="text-2xl font-bold text-gray-900">{analyticsData.overview.overview?.total_files || 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center">
                      <div className="p-3 bg-green-100 rounded-xl">
                        <Folder className="w-6 h-6 text-green-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-sm font-medium text-gray-500">Total Folders</h3>
                        <p className="text-2xl font-bold text-gray-900">{analyticsData.overview.overview?.total_folders || 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center">
                      <div className="p-3 bg-orange-100 rounded-xl">
                        <Rss className="w-6 h-6 text-orange-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-sm font-medium text-gray-500">RSS Items</h3>
                        <p className="text-2xl font-bold text-gray-900">{analyticsData.overview.overview?.total_rss_items || 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                    <div className="flex items-center">
                      <div className="p-3 bg-purple-100 rounded-xl">
                        <HardDrive className="w-6 h-6 text-purple-600" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-sm font-medium text-gray-500">Storage Used</h3>
                        <p className="text-2xl font-bold text-gray-900">
                          {formatFileSize(analyticsData.overview.overview?.total_size || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Monthly Uploads Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Monthly Upload Trends</h2>
                  {analyticsData.monthlyUploads?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analyticsData.monthlyUploads}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <BarChart3 className="w-12 h-12 mx-auto mb-2" />
                        <p>No upload data available</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* File Type Breakdown */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">File Type Distribution</h2>
                  {analyticsData.overview?.typeBreakdown?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analyticsData.overview.typeBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ primary_type, percent }) => `${primary_type} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {analyticsData.overview.typeBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-gray-500">
                      <div className="text-center">
                        <PieChart className="w-12 h-12 mx-auto mb-2" />
                        <p>No file type data available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              {analyticsData.overview?.recentActivity?.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">Recent Upload Activity</h2>
                  </div>
                  <div className="p-6">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={analyticsData.overview.recentActivity}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="uploads" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex"
         onDragEnter={handleDragEnter}
         onDragLeave={handleDragLeave}
         onDragOver={handleDragOver}
         onDrop={handleDrop}>
      
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="ml-3">
                <h1 className="text-lg font-bold text-gray-900">Incubrix</h1>
                <p className="text-xs text-gray-500">CMS v2.2</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'library' 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <HardDrive className="w-5 h-5" />
              {!sidebarCollapsed && <span>My Drive</span>}
            </button>

            <button
              onClick={() => {
                setActiveTab('rss');
                fetchRssPreview();
              }}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'rss' 
                  ? 'bg-orange-50 text-orange-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Youtube className="w-5 h-5" />
              {!sidebarCollapsed && <span>YouTube RSS</span>}
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                activeTab === 'analytics' 
                  ? 'bg-purple-50 text-purple-600' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              {!sidebarCollapsed && <span>Analytics</span>}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Quick Stats */}
              {stats && (
                <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Stats</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Files:</span>
                      <span className="font-medium">{stats.total_files}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Folders:</span>
                      <span className="font-medium">{stats.total_folders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Storage:</span>
                      <span className="font-medium">{formatFileSize(stats.total_size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">RSS Items:</span>
                      <span className="font-medium">{stats.total_rss_items}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 space-y-2">
                <button
                  onClick={exportToExcel}
                  disabled={exporting}
                  className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {exporting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>Export to Excel</span>
                </button>

                <button
                  onClick={() => {
                    setConfirmDialog({
                      title: 'Clear All Data',
                      message: 'Are you sure you want to clear all data? This action cannot be undone and will permanently delete all files, folders, and RSS settings.',
                      onConfirm: () => {
                        clearAllData();
                        setConfirmDialog(null);
                      },
                      onCancel: () => setConfirmDialog(null)
                    });
                  }}
                  disabled={clearing}
                  className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  {clearing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>Clear All Data</span>
                </button>
              </div>
            </>
          )}
        </nav>

        {/* Sidebar Toggle */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {renderMainContent()}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFileUpload(Array.from(e.target.files))}
      />
      
      <input
        ref={folderInputRef}
        type="file"
        webkitdirectory="true"
        className="hidden"
        onChange={(e) => e.target.files && handleFileUpload(Array.from(e.target.files), true)}
      />

      {/* Modals */}
      {newFolderModal && <NewFolderModal />}
      {renameModal && <RenameModal asset={renameModal} onClose={() => setRenameModal(null)} />}
      {previewModal && <FilePreviewModal asset={previewModal} onClose={() => setPreviewModal(null)} />}
      {deleteConfirmation && <DeleteConfirmationModal asset={deleteConfirmation} onClose={() => setDeleteConfirmation(null)} />}
      {editingRssAsset && <RssAssetEditor asset={editingRssAsset} onClose={() => setEditingRssAsset(null)} />}
      {rssSettingsModal && <RssSettingsModal />}
      {folderRssModal && <FolderRssModal folder={folderRssModal} onClose={() => setFolderRssModal(null)} />}
      {publicFeedModal && <PublicFeedModal />}
      {confirmDialog && (
        <ConfirmationDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          asset={contextMenu.asset}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Notifications */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2">
          <Check className="w-5 h-5" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Uploading files...</span>
        </div>
      )}
    </div>
  );
};

export default IncubrixCMS;
