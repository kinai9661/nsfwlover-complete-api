import { useState, useRef, useEffect } from 'react';
import './ImageGenerator.css';

const MODELS = [
  { id: 'zimage-turbo', name: 'Z-Image Turbo', speed: '⚡ 极快 (2-5秒)', maxImages: 4 },
  { id: 'flux2klein', name: 'Flux 2 Klein', speed: '🚀 中速 (5-10秒)', maxImages: 4 }
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '正方形', size: '1024×1024', icon: '⬜', desc: '社交媒体' },
  { id: '16:9', label: '横向宽屏', size: '1344×768', icon: '▬', desc: 'YouTube' },
  { id: '9:16', label: '竖向全屏', size: '768×1344', icon: '▮', desc: 'Stories' },
  { id: '4:3', label: '传统横向', size: '1152×896', icon: '▭', desc: '演示文稿' },
  { id: '3:4', label: '传统竖向', size: '896×1152', icon: '▯', desc: '海报' },
  { id: '21:9', label: '超宽屏', size: '1536×640', icon: '━', desc: '电影' },
  { id: '3:2', label: '经典照片', size: '1216×832', icon: '▭', desc: '摄影' },
  { id: '2:3', label: '肖像', size: '832×1216', icon: '▯', desc: '人像' }
];

const PROMPT_TEMPLATES = [
  { name: '人物肖像', prompt: 'portrait of a person, detailed face, professional lighting, high quality' },
  { name: '风景', prompt: 'beautiful landscape, mountains, sunset, vibrant colors, 8k' },
  { name: '动漫风格', prompt: 'anime style illustration, colorful, detailed, high quality' },
  { name: '写实风格', prompt: 'photorealistic, ultra detailed, professional photography, 8k' },
  { name: '科幻场景', prompt: 'cyberpunk city, neon lights, futuristic, detailed, cinematic' },
  { name: '梦幻场景', prompt: 'dreamy atmosphere, soft lighting, magical, fantasy world' }
];

interface HistoryItem {
  id: string;
  mode: 'txt2img' | 'img2img';
  model: string;
  prompt: string;
  images: any[];
  timestamp: number;
  settings: any;
}

export function ImageGenerator() {
  const [mode, setMode] = useState<'txt2img' | 'img2img'>('txt2img');
  const [model, setModel] = useState('zimage-turbo');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numImages, setNumImages] = useState(1);
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [strength, setStrength] = useState(0.75);
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 加载历史记录
  useEffect(() => {
    const saved = localStorage.getItem('generation_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  // 保存历史记录
  const saveToHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem('generation_history', JSON.stringify(newHistory));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    const startTime = Date.now();

    try {
      const endpoint = mode === 'txt2img' ? '/api/generate' : '/api/img2img';
      const payload: any = { model, prompt, negative_prompt: negativePrompt };

      if (seed) payload.seed = parseInt(seed);

      if (mode === 'txt2img') {
        payload.aspect_ratio = aspectRatio;
        payload.n = numImages;
      } else {
        if (!inputImage) throw new Error('请先上传图片');
        payload.image = inputImage;
        payload.strength = strength;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        setResults(data.images);

        // 保存到历史
        saveToHistory({
          id: Date.now().toString(),
          mode,
          model,
          prompt,
          images: data.images,
          timestamp: Date.now(),
          settings: { aspectRatio, numImages, strength, seed, negativePrompt }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ 生成完成，耗时 ${duration}秒`);
      } else {
        setError(data.error || '生成失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('图片大小不能超过 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setInputImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const loadTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    setPrompt(template.prompt);
  };

  const loadHistory = (item: HistoryItem) => {
    setMode(item.mode);
    setModel(item.model);
    setPrompt(item.prompt);
    if (item.settings.aspectRatio) setAspectRatio(item.settings.aspectRatio);
    if (item.settings.numImages) setNumImages(item.settings.numImages);
    if (item.settings.strength) setStrength(item.settings.strength);
    if (item.settings.seed) setSeed(item.settings.seed.toString());
    if (item.settings.negativePrompt) setNegativePrompt(item.settings.negativePrompt);
    setShowHistory(false);
  };

  const randomSeed = () => setSeed(Math.floor(Math.random() * 1000000).toString());

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('已复制到剪贴板！');
  };

  const downloadImage = async (url: string, index: number) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `generated-${Date.now()}-${index}.png`;
    link.click();
  };

  const clearHistory = () => {
    if (confirm('确定清空历史记录？')) {
      setHistory([]);
      localStorage.removeItem('generation_history');
    }
  };

  return (
    <div className="generator-container">
      <div className="generator">
        <div className="header">
          <h1>🎨 AI 图片生成器</h1>
          <p className="subtitle">基于 NSFWLover API - 支持文生图、图生图、批量生成</p>
        </div>

        {/* 模式切换 */}
        <div className="mode-tabs">
          <button 
            className={mode === 'txt2img' ? 'active' : ''}
            onClick={() => setMode('txt2img')}
          >
            <span className="tab-icon">📝</span>
            <span className="tab-label">文生图</span>
            <span className="tab-desc">从文字描述生成</span>
          </button>
          <button 
            className={mode === 'img2img' ? 'active' : ''}
            onClick={() => setMode('img2img')}
          >
            <span className="tab-icon">🖼️</span>
            <span className="tab-label">图生图</span>
            <span className="tab-desc">基于原图修改</span>
          </button>
        </div>

        {/* 主表单 */}
        <div className="form">
          {/* 模型选择 */}
          <div className="form-group">
            <label>🤖 AI 模型</label>
            <div className="model-select">
              {MODELS.map(m => (
                <button
                  key={m.id}
                  className={`model-btn ${model === m.id ? 'active' : ''}`}
                  onClick={() => setModel(m.id)}
                >
                  <div className="model-name">{m.name}</div>
                  <div className="model-speed">{m.speed}</div>
                  <div className="model-limit">最多 {m.maxImages} 张</div>
                </button>
              ))}
            </div>
          </div>

          {/* 图生图上传 */}
          {mode === 'img2img' && (
            <div className="form-group">
              <label>🖼️ 上传原图</label>
              {!inputImage ? (
                <div className="upload-area" onClick={() => fileRef.current?.click()}>
                  <div className="upload-icon">📤</div>
                  <div className="upload-text">点击或拖拽上传图片</div>
                  <div className="upload-hint">支持 JPG, PNG, WEBP (最大 10MB)</div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display: 'none'}} />
                </div>
              ) : (
                <div className="image-preview">
                  <img src={inputImage} alt="Input" />
                  <div className="preview-actions">
                    <button className="preview-btn remove" onClick={() => setInputImage(null)}>
                      ❌ 移除
                    </button>
                    <button className="preview-btn change" onClick={() => fileRef.current?.click()}>
                      🔄 更换
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 提示词 */}
          <div className="form-group">
            <label>✍️ {mode === 'txt2img' ? '提示词' : '修改指令'} *</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === 'txt2img' 
                ? "详细描述你想要生成的图片，例如：a beautiful sunset over the ocean, vibrant colors, detailed, 8k"
                : "描述你想要如何修改图片，例如：change the background to a forest, add sunset lighting"
              }
              rows={4}
              className="prompt-input"
            />
            {mode === 'txt2img' && (
              <div className="template-chips">
                <span className="chips-label">快速模板：</span>
                {PROMPT_TEMPLATES.map((t, i) => (
                  <button key={i} className="chip" onClick={() => loadTemplate(t)}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 负向提示词 */}
          <div className="form-group">
            <label>🚫 负向提示词（不想要的元素）</label>
            <input 
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="例如：blurry, low quality, distorted, ugly"
              className="input"
            />
          </div>

          {/* 文生图选项 */}
          {mode === 'txt2img' && (
            <>
              {/* 图片比例 */}
              <div className="form-group">
                <label>📐 图片比例</label>
                <div className="ratio-grid">
                  {ASPECT_RATIOS.map(ratio => (
                    <button
                      key={ratio.id}
                      className={`ratio-card ${aspectRatio === ratio.id ? 'active' : ''}`}
                      onClick={() => setAspectRatio(ratio.id)}
                    >
                      <div className="ratio-icon">{ratio.icon}</div>
                      <div className="ratio-label">{ratio.label}</div>
                      <div className="ratio-size">{ratio.size}</div>
                      <div className="ratio-desc">{ratio.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成数量 */}
              <div className="form-group">
                <label>🔢 生成数量：{numImages} 张</label>
                <div className="slider-container">
                  <input 
                    type="range"
                    min="1"
                    max="4"
                    value={numImages}
                    onChange={(e) => setNumImages(parseInt(e.target.value))}
                    className="slider"
                  />
                  <div className="slider-marks">
                    {[1, 2, 3, 4].map(n => (
                      <span key={n} className={numImages === n ? 'active' : ''}>{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 图生图选项 */}
          {mode === 'img2img' && (
            <div className="form-group">
              <label>💪 变化强度：{strength.toFixed(2)}</label>
              <div className="slider-container">
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={strength}
                  onChange={(e) => setStrength(parseFloat(e.target.value))}
                  className="slider"
                />
                <div className="slider-labels">
                  <span>保守<br/>0.5</span>
                  <span>适中<br/>0.75</span>
                  <span>激进<br/>1.0</span>
                </div>
              </div>
              <div className="hint">
                💡 低强度保留原图细节，高强度创造性更强
              </div>
            </div>
          )}

          {/* 高级选项 */}
          <div className="form-group">
            <button 
              className="advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              ⚙️ 高级选项 {showAdvanced ? '▼' : '▶'}
            </button>
            {showAdvanced && (
              <div className="advanced-options">
                <div className="advanced-item">
                  <label>🎲 随机种子（留空自动生成）</label>
                  <div className="seed-input">
                    <input 
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      placeholder="留空随机"
                      className="input"
                    />
                    <button className="btn-secondary" onClick={randomSeed}>
                      🎲 随机
                    </button>
                  </div>
                  <div className="hint">相同种子会生成相似图片</div>
                </div>
              </div>
            )}
          </div>

          {/* 生成按钮 */}
          <button 
            onClick={handleGenerate}
            disabled={loading || !prompt || (mode === 'img2img' && !inputImage)}
            className="generate-btn"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                <span>生成中，请稍候...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>{mode === 'txt2img' ? `生成 ${numImages} 张图片` : '开始转换'}</span>
              </>
            )}
          </button>

          {/* 快捷按钮 */}
          <div className="quick-actions">
            <button className="btn-secondary" onClick={() => setShowHistory(!showHistory)}>
              📜 历史记录 ({history.length})
            </button>
            <button className="btn-secondary" onClick={() => {
              setPrompt('');
              setNegativePrompt('blurry, low quality');
              setSeed('');
              setInputImage(null);
              setResults([]);
              setError('');
            }}>
              🔄 重置
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-box">
            <span className="error-icon">❌</span>
            <span>{error}</span>
          </div>
        )}

        {/* 生成结果 */}
        {results.length > 0 && (
          <div className="results">
            <div className="results-header">
              <h2>✨ 生成结果 ({results.length} 张)</h2>
              <button className="btn-secondary" onClick={() => setResults([])}>
                清空结果
              </button>
            </div>
            <div className="image-grid">
              {results.map((img, index) => (
                <div key={index} className="image-card">
                  <div className="image-wrapper">
                    <img src={img.url} alt={`Generated ${index + 1}`} loading="lazy" />
                    <div className="image-overlay">
                      <button className="overlay-btn" onClick={() => downloadImage(img.url, index)}>
                        💾 下载
                      </button>
                      <button className="overlay-btn" onClick={() => copyPrompt(img.url)}>
                        📋 复制链接
                      </button>
                      {mode === 'txt2img' && (
                        <button className="overlay-btn" onClick={() => {
                          setMode('img2img');
                          setInputImage(img.url);
                        }}>
                          🔄 再次编辑
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="image-info">
                    <div className="image-index">#{index + 1}</div>
                    <div className="image-size">{mode === 'txt2img' ? ASPECT_RATIOS.find(r => r.id === aspectRatio)?.size : '原图尺寸'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 历史记录侧边栏 */}
        {showHistory && (
          <div className="history-sidebar">
            <div className="history-header">
              <h3>📜 历史记录</h3>
              <div>
                <button className="btn-icon" onClick={clearHistory}>🗑️</button>
                <button className="btn-icon" onClick={() => setShowHistory(false)}>✕</button>
              </div>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="history-empty">暂无历史记录</div>
              ) : (
                history.map(item => (
                  <div key={item.id} className="history-item" onClick={() => loadHistory(item)}>
                    <div className="history-images">
                      {item.images.slice(0, 2).map((img, i) => (
                        <img key={i} src={img.url} alt="" />
                      ))}
                    </div>
                    <div className="history-content">
                      <div className="history-prompt">{item.prompt.substring(0, 50)}...</div>
                      <div className="history-meta">
                        <span>{item.mode === 'txt2img' ? '文生图' : '图生图'}</span>
                        <span>{new Date(item.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 页脚 */}
      <div className="footer">
        <p>Powered by NSFWLover API | Made with ❤️</p>
      </div>
    </div>
  );
}
