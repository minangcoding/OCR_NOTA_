import { useState, useRef, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { UploadCloud, Plus, Trash2, ArrowLeft, Loader2, Camera, X, FolderOpen } from 'lucide-react';

const noteItemSchema = z.object({
  item_name: z.string().min(1, 'Item name is required'),
  qty: z.number().min(1, 'Min qty is 1'),
  price: z.number().min(0, 'Min price is 0'),
  subtotal: z.number(),
});

const noteSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  buyer_name: z.string().min(1, 'Buyer name is required'),
  requester_name: z.string().min(1, 'Requester name is required'),
  category_id: z.string().min(1, 'Category is required'),
  image_url: z.string().min(1, 'Receipt image is required'),
  items: z.array(noteItemSchema).min(1, 'At least one item is required'),
});

type NoteFormValues = z.infer<typeof noteSchema>;

export default function NoteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  // Synchronous handler — MUST NOT be async so mobile browsers
  // treat the .click() as a direct user gesture (not blocked).
  const handleCameraClick = () => {
    setImagePreview(null);

    // On insecure contexts (HTTP via IP), getUserMedia is unreliable.
    // Directly open the native camera app which works on 100% of devices.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      cameraInputRef.current?.click();
      return;
    }

    // Secure context — use the in-browser camera UI
    startCameraStream();
  };

  const startCameraStream = async () => {
    setIsCameraOpen(true);
    try {
      // Try to access rear camera first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      // If that fails, try default camera
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        // getUserMedia completely failed. Fall back to native camera app.
        setIsCameraOpen(false);
        cameraInputRef.current?.click();
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const takePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // Safety: on mobile, video might not be fully ready yet
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert('Camera is not ready yet. Please wait a moment and try again.');
      return;
    }

    // Scale down large phone camera images (e.g. 4032x3024) to max 1200px width
    // to prevent upload timeouts and speed up OCR processing
    const MAX_DIM = 1200;
    let cw = video.videoWidth;
    let ch = video.videoHeight;
    if (cw > MAX_DIM || ch > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / cw, MAX_DIM / ch);
      cw = Math.round(cw * ratio);
      ch = Math.round(ch * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, cw, ch);
      canvas.toBlob((blob) => {
        if (blob) {
          stopCamera();
          setUploading(true);
          uploadMutation.mutate({ blob, name: "scanned_receipt.jpg" });
        } else {
          alert('Failed to capture photo. Please try uploading an image file instead.');
        }
      }, 'image/jpeg', 0.75);
    }
  };

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      date: '',
      buyer_name: '',
      requester_name: '',
      category_id: '',
      image_url: '',
      items: [] 
    }
  });

  // Fetch note for edit mode
  useQuery({
    queryKey: ['note', id],
    queryFn: async () => {
      if (!isEditMode) return null;
      const res = await api.get(`/notes/${id}`);
      const note = res.data.data;
      
      setValue('date', new Date(note.date).toISOString().split('T')[0]);
      setValue('buyer_name', note.buyer.name);
      setValue('requester_name', note.requester.name);
      setValue('category_id', note.category_id);
      setValue('image_url', note.image_url || '');
      if (note.image_url) {
        // Support both base64 data URI and legacy file path
        if (note.image_url.startsWith('data:')) {
          setImagePreview(note.image_url);
        } else {
          setImagePreview(`http://${window.location.hostname}:3000${note.image_url}`);
        }
      }
      
      const formItems = note.items.map((i: { item_name: string; qty: number; price: string | number; subtotal: string | number }) => ({
        item_name: i.item_name,
        qty: i.qty,
        price: Number(i.price),
        subtotal: Number(i.subtotal)
      }));
      setValue('items', formItems);
      
      return note;
    },
    enabled: isEditMode
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const items = watch('items');
  const total = items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.price || 0)), 0);

  // Fetch Categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      // Only return active categories
      return res.data.data.filter((c: { is_active: boolean }) => c.is_active) as { id: string; name: string; code: string; is_active: boolean }[];
    }
  });

  // Calculate subtotal for each row when qty or price changes
  const handleItemChange = (index: number, field: 'qty' | 'price', value: number) => {
    const currentQty = field === 'qty' ? value : items[index].qty;
    const currentPrice = field === 'price' ? value : items[index].price;
    setValue(`items.${index}.subtotal`, currentQty * currentPrice);
  };

  const uploadMutation = useMutation({
    mutationFn: async (payload: { blob: Blob | File, name: string }) => {
      const formData = new FormData();
      formData.append('image', payload.blob, payload.name);
      // Remove hardcoded Content-Type header so Axios can automatically 
      // set the multipart boundary. Without the boundary, multer hangs.
      const res = await api.post('/notes/upload', formData);
      return res.data.data;
    },
    onSuccess: (data) => {
      // Data contains { imageUrl, ocrData }
      setImagePreview(data.imageUrl);
      setValue('image_url', data.imageUrl);
      
      // Auto fill form with Mock OCR data
      if (data.ocrData) {
        setValue('date', data.ocrData.date);
        setValue('buyer_name', data.ocrData.buyer_name);
        setValue('requester_name', data.ocrData.requester_name);
        
        // Remove existing items and add from OCR
        const ocrItems = data.ocrData.items.map((i: { item_name: string; qty: number; price: number; subtotal: number }) => ({
          item_name: i.item_name,
          qty: i.qty,
          price: i.price,
          subtotal: i.subtotal
        }));
        
        setValue('items', ocrItems);
      }
      setUploading(false);
    },
    onError: (err: unknown) => {
      setUploading(false);
      alert('Failed to upload image: ' + (err as Error).message);
    }
  });

  const submitMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => isEditMode ? api.patch(`/notes/${id}`, data) : api.post('/notes', data),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);

      // Resize large images from phone camera/gallery before uploading
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1200;
          let w = img.width;
          let h = img.height;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              if (blob) {
                uploadMutation.mutate({ blob, name: file.name });
              } else {
                uploadMutation.mutate({ blob: file, name: file.name }); // fallback to original
              }
            }, 'image/jpeg', 0.75);
          } else {
            uploadMutation.mutate({ blob: file, name: file.name });
          }
        };
        img.onerror = () => uploadMutation.mutate({ blob: file, name: file.name }); // fallback
        img.src = URL.createObjectURL(file);
      } else {
        uploadMutation.mutate({ blob: file, name: file.name });
      }
    }
    // Reset input value so the same file can be selected again
    e.target.value = '';
  };

  const onSubmit = async (data: NoteFormValues) => {
    const payload = {
      ...data,
      total
    };
    try {
      await submitMutation.mutateAsync(payload);
      // Force full redirect to receipts page
      window.location.href = '/receipts';
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = err as any;
      alert(`Failed to ${isEditMode ? 'update' : 'save'} note: ` + (error.response?.data?.message || error.message));
    }
  };

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI BERSAMA DENGAN PADDING/MARGIN */
    <div className="font-body-md text-gray-800 dark:text-white antialiased bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto pb-12">
        
        {/* ================= HEADER ================= */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/receipts')}
            className="p-2 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-[#1e293b] dark:text-gray-300" />
          </button>
          <h1 className="font-h2 text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">
            {isEditMode ? 'Edit Receipt' : 'Capture Receipt'}
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ================= LEFT COLUMN: UPLOAD ================= */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">Receipt Upload</h2>
            
            <div className="bg-white dark:bg-[#1a1a1c] p-6 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 flex-1">
              
              {!imagePreview ? (
                isCameraOpen ? (
                  // Kamera UI
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] max-h-[500px] flex flex-col shadow-sm">
                    <video ref={handleVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 inset-x-0 p-6 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
                      <button 
                        type="button" 
                        onClick={stopCamera}
                        className="w-12 h-12 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 backdrop-blur-sm transition-colors"
                      >
                        <X className="w-6 h-6" />
                      </button>
                      <button 
                        type="button"
                        onClick={takePhoto}
                        className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                      ></button>
                      <div className="w-12 h-12"></div>
                    </div>
                  </div>
                ) : (
                  // KOTAK UPLOAD MOCKUP BARU (Garis putus-putus kemerahan)
                  <div className={`border-2 border-dashed rounded-2xl px-6 py-12 flex flex-col items-center justify-center text-center transition-colors h-full min-h-[400px]
                    ${uploading ? 'bg-gray-50 border-gray-300 dark:bg-[#252525] dark:border-gray-700' : 'border-[#ecc7c7] bg-[#fffafb] dark:bg-[#1a1a1c] dark:border-red-900/30'}
                  `}>
                    {uploading ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="w-12 h-12 text-[#a60016] animate-spin mb-4" />
                        <p className="text-sm font-bold text-gray-800 dark:text-white">Processing Receipt...</p>
                        <p className="text-xs text-gray-500 mt-1">Extracting data with AI Engine</p>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="w-12 h-12 text-[#4a5568] dark:text-gray-400 mb-3" />
                        <p className="text-base font-bold text-[#1e293b] dark:text-white mb-1">Drag & drop your receipt here</p>
                        <p className="text-xs text-[#64748b] dark:text-gray-500 mb-8">Supports JPG, PNG, PDF</p>
                        
                        <div className="flex items-center w-full mb-8">
                          <div className="flex-1 h-[1px] bg-[#ecc7c7] dark:bg-gray-700"></div>
                          <span className="px-4 text-[10px] font-bold text-[#94a3b8] dark:text-gray-500 tracking-widest uppercase">OR</span>
                          <div className="flex-1 h-[1px] bg-[#ecc7c7] dark:bg-gray-700"></div>
                        </div>

                        {/* Tombol Biru Muda (Kamera) */}
                        <button 
                          type="button"
                          onClick={handleCameraClick}
                          className="w-full mb-4 py-3.5 bg-[#e6effb] text-[#2c4b72] dark:bg-blue-900/30 dark:text-blue-300 rounded-xl font-bold text-sm flex justify-center items-center gap-2 hover:bg-[#dbe6f7] dark:hover:bg-blue-900/50 transition-colors"
                        >
                          <Camera className="w-4 h-4" /> Capture with Camera
                        </button>
                        
                        {/* Tombol Merah Intek (Browse) */}
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-3.5 bg-[#a60016] text-white hover:bg-[#8b0012] rounded-xl font-bold text-sm flex justify-center items-center gap-2 transition-colors shadow-sm"
                        >
                          <FolderOpen className="w-4 h-4" /> Browse Files
                        </button>
                      </>
                    )}
                  </div>
                )
              ) : (
                // Tampilan Gambar yang Sudah Diupload
                <div className="relative group rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525] h-full min-h-[400px] flex items-center justify-center">
                  <img src={imagePreview} alt="Receipt Preview" className="w-full h-auto object-contain max-h-[600px]" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <div className="flex flex-col gap-3 w-48">
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white text-gray-800 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-100 flex items-center justify-center gap-2 shadow-sm"
                      >
                        <UploadCloud className="w-4 h-4" /> Upload New
                      </button>
                      <button 
                        type="button"
                        onClick={handleCameraClick}
                        className="bg-[#a60016] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#8b0012] flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Camera className="w-4 h-4" /> Retake Photo
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Hidden Inputs untuk file */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/jpeg, image/png, image/jpg, application/pdf"
                onChange={handleFileChange}
              />
              <input 
                type="file" 
                ref={cameraInputRef} 
                className="hidden" 
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />
              <input type="hidden" {...register('image_url')} />
              {errors.image_url && <p className="text-[#a60016] text-xs mt-2 font-semibold text-center">{errors.image_url.message}</p>}
            </div>
          </div>

          {/* ================= RIGHT COLUMN: FORM ================= */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">Transaction Details</h2>
              
              {/* CARD: Form Kiri Kanan Sesuai Mockup */}
              <div className="bg-white dark:bg-[#1a1a1c] p-6 sm:p-8 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Date</label>
                    <input 
                      type="date" 
                      {...register('date')}
                      className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                    />
                    {errors.date && <p className="text-[#a60016] text-xs mt-1.5 font-medium">{errors.date.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Category</label>
                    <select 
                      {...register('category_id')}
                      className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors cursor-pointer shadow-sm"
                    >
                      <option value="">Select Category</option>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                    {errors.category_id && <p className="text-[#a60016] text-xs mt-1.5 font-medium">{errors.category_id.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Buyer Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      {...register('buyer_name')}
                      className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                    />
                    {errors.buyer_name && <p className="text-[#a60016] text-xs mt-1.5 font-medium">{errors.buyer_name.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Requester Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Jane Smith"
                      {...register('requester_name')}
                      className="w-full px-4 py-3 bg-gray-50/50 dark:bg-[#252525] border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-[#a60016] text-sm text-gray-700 dark:text-white transition-colors shadow-sm"
                    />
                    {errors.requester_name && <p className="text-[#a60016] text-xs mt-1.5 font-medium">{errors.requester_name.message}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* CARD: Items Table Sesuai Mockup */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#1e293b] dark:text-white ml-1">Items</h2>
              
              <div className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[550px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
                        <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300">Item Name</th>
                        <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-24">Qty</th>
                        <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-32">Price</th>
                        <th className="px-6 py-5 text-sm font-bold text-[#1e293b] dark:text-gray-300 w-32">Subtotal</th>
                        <th className="px-4 py-5 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-[#1a1a1c]">
                      {fields.map((field, index) => (
                        <tr key={field.id} className="hover:bg-gray-50/50 dark:hover:bg-[#202022] transition-colors">
                          <td className="px-4 py-2">
                            <input 
                              {...register(`items.${index}.item_name`)}
                              className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 placeholder-gray-300 outline-none" 
                              placeholder="Item description"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              {...register(`items.${index}.qty`, { 
                                valueAsNumber: true,
                                onChange: (e) => handleItemChange(index, 'qty', parseFloat(e.target.value) || 0)
                              })}
                              className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 outline-none" 
                              min="1"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              {...register(`items.${index}.price`, { 
                                valueAsNumber: true,
                                onChange: (e) => handleItemChange(index, 'price', parseFloat(e.target.value) || 0)
                              })}
                              className="w-full bg-transparent border-0 focus:ring-0 rounded p-2 text-[14px] font-medium text-gray-500 dark:text-gray-400 outline-none" 
                              min="0"
                            />
                          </td>
                          <td className="px-4 py-2 text-[#1e293b] dark:text-white font-bold text-[14px]">
                            Rp {((items[index]?.qty || 0) * (items[index]?.price || 0)).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button 
                              type="button" 
                              onClick={() => remove(index)}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-gray-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Tombol Add Row Warna Merah Sesuai Mockup */}
                <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
                  <button 
                    type="button"
                    onClick={() => append({ item_name: '', qty: 0, price: 0, subtotal: 0 })}
                    className="text-[#a60016] font-semibold text-sm flex items-center gap-2 hover:opacity-80 transition-opacity ml-2"
                  >
                    <Plus className="w-4 h-4 font-bold" /> Add Row
                  </button>
                </div>
              </div>
            </div>

            {/* CARD: Submit & Total Paling Bawah (Sesuai Mockup) */}
            <div className="bg-white dark:bg-[#1a1a1c] p-5 sm:p-6 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-6 mt-2">
              
              <div className="flex items-center gap-5 w-full sm:w-auto ml-2">
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-widest uppercase leading-tight">Total<br/>Amount</span>
                <span className="text-3xl font-bold text-[#a60016]">
                  Rp {total.toLocaleString('id-ID')}
                </span>
              </div>
              
              <div className="flex w-full sm:w-auto gap-4">
                <button 
                  type="button"
                  onClick={() => navigate('/receipts')}
                  className="flex-1 sm:flex-none px-8 py-3.5 border-2 border-gray-200 dark:border-gray-700 text-[#4a5568] dark:text-gray-300 font-bold text-[15px] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitMutation.isPending || items.length === 0}
                  className="flex-1 sm:flex-none px-10 py-3.5 bg-[#a60016] text-white font-bold text-[15px] rounded-xl hover:bg-[#8b0012] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-red-900/10"
                >
                  {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Receipt
                </button>
              </div>

            </div>

          </div>
        </form>
      </div>
    </div>
  );
}