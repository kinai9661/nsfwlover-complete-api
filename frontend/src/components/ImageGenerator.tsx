import { useState, useRef } from 'react';
import './ImageGenerator.css';

export function ImageGenerator() {
  const [mode, setMode] = useState<'txt2img' | 'img2img'>('txt2img');
  const [model, setModel] = useState('zimage-turbo');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [numImages, setNumImages] = useState(1);
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [strength, setStrength] = useState(0.75);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'txt2img' ? '/api/generate' : '/api/img2img';
      const payload: any = { model, prompt };
      if (mode === 'txt2img') {
        payload.aspect_ratio = aspectRatio;
        payload.n = numImages;
      } else {
        if (!inputImage) throw new Error('请上传图片');
        payload.image = inputImage;
        payload.strength = strength;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) setResults(data.images);
      else setError(data.error);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setInputImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="generator">
      <h1>🎨 NSFWLover 图片生成</h1>
      <div className="tabs">
        <button className={mode === 'txt2img' ? 'active' : ''} onClick={() => setMode('txt2img')}>文生图</button>
        <button className={mode === 'img2img' ? 'active' : ''} onClick={() => setMode('img2img')}>图生图</button>
      </div>
      <div className="form">
        <label>模型</label>
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="zimage-turbo">Z-Image Turbo (快)</option>
          <option value="flux2klein">Flux 2 Klein (中)</option>
        </select>
        {mode === 'img2img' && (
          <div>
            <label>上传图片</label>
            {!inputImage ? (
              <div className="upload" onClick={() => fileRef.current?.click()}>
                <div>📤 点击上传</div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display: 'none'}} />
              </div>
            ) : (
              <div className="preview">
                <img src={inputImage} alt="Input" />
                <button onClick={() => setInputImage(null)}>✕</button>
              </div>
            )}
          </div>
        )}
        <label>提示词 *</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
        {mode === 'txt2img' && (
          <>
            <label>比例</label>
            <div className="ratios">
              {['1:1', '16:9', '9:16', '4:3', '3:4'].map(r => (
                <button key={r} className={aspectRatio === r ? 'active' : ''} onClick={() => setAspectRatio(r)}>{r}</button>
              ))}
            </div>
            <label>数量: {numImages}</label>
            <input type="range" min="1" max="4" value={numImages} onChange={(e) => setNumImages(+e.target.value)} />
          </>
        )}
        {mode === 'img2img' && (
          <>
            <label>强度: {strength}</label>
            <input type="range" min="0" max="1" step="0.05" value={strength} onChange={(e) => setStrength(+e.target.value)} />
          </>
        )}
        <button onClick={handleGenerate} disabled={loading || !prompt || (mode === 'img2img' && !inputImage)}>
          {loading ? '生成中...' : mode === 'txt2img' ? `生成 ${numImages} 张` : '转换'}
        </button>
      </div>
      {error && <div className="error">❌ {error}</div>}
      {results.length > 0 && (
        <div className="results">
          <h2>生成结果 ({results.length})</h2>
          <div className="grid">
            {results.map((img, i) => (
              <div key={i} className="item">
                <img src={img.url} alt={`Result ${i}`} />
                <a href={img.url} download>下载</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
