import os,sys,time,json
from pathlib import Path
import tempfile
out=Path(os.environ.get('BLACKOUT_TEST_DIR',str(Path(tempfile.gettempdir())/'blackout-benchmark')))
if Path('/usr/lib/chromium/vk_swiftshader_icd.json').exists():
    os.environ.setdefault('VK_ICD_FILENAMES','/usr/lib/chromium/vk_swiftshader_icd.json')
import wgpu
from PIL import Image
adapter=wgpu.gpu.request_adapter_sync(power_preference='high-performance')
print('ADAPTER',adapter.info,flush=True)
d=adapter.request_device_sync()
vdata=open(out/'vertices.bin','rb').read();udata=open(out/'uniform.bin','rb').read()
vb=d.create_buffer_with_data(data=vdata,usage=wgpu.BufferUsage.VERTEX)
ub=d.create_buffer_with_data(data=udata,usage=wgpu.BufferUsage.UNIFORM|wgpu.BufferUsage.COPY_DST)
shadow=d.create_texture(size=(2048,2048,1),format='depth32float',usage=wgpu.TextureUsage.RENDER_ATTACHMENT|wgpu.TextureUsage.TEXTURE_BINDING)
sv=shadow.create_view();depth=d.create_texture(size=(1440,900,1),format='depth24plus',usage=wgpu.TextureUsage.RENDER_ATTACHMENT)
color=d.create_texture(size=(1440,900,1),format='rgba8unorm',usage=wgpu.TextureUsage.RENDER_ATTACHMENT|wgpu.TextureUsage.COPY_SRC)
module=d.create_shader_module(code=open(out/'main.wgsl').read());sm=d.create_shader_module(code=open(out/'shadow.wgsl').read())
layout=d.create_bind_group_layout(entries=[{'binding':0,'visibility':wgpu.ShaderStage.VERTEX|wgpu.ShaderStage.FRAGMENT,'buffer':{'type':'uniform'}},{'binding':1,'visibility':wgpu.ShaderStage.FRAGMENT,'texture':{'sample_type':'depth'}},{'binding':2,'visibility':wgpu.ShaderStage.FRAGMENT,'sampler':{'type':'comparison'}}])
bind=d.create_bind_group(layout=layout,entries=[{'binding':0,'resource':{'buffer':ub}},{'binding':1,'resource':sv},{'binding':2,'resource':d.create_sampler(compare='less-equal',mag_filter='linear',min_filter='linear')}])
pl=d.create_pipeline_layout(bind_group_layouts=[layout]);vl={'array_stride':40,'attributes':[{'shader_location':0,'offset':0,'format':'float32x3'},{'shader_location':1,'offset':12,'format':'float32x3'},{'shader_location':2,'offset':24,'format':'float32x3'},{'shader_location':3,'offset':36,'format':'float32'}]}
pipeline=d.create_render_pipeline(layout=pl,vertex={'module':module,'entry_point':'vs','buffers':[vl]},fragment={'module':module,'entry_point':'fs','targets':[{'format':'rgba8unorm'}]},primitive={'topology':'triangle-list','cull_mode':'none'},depth_stencil={'format':'depth24plus','depth_write_enabled':True,'depth_compare':'less'})
skyp=d.create_render_pipeline(layout=pl,vertex={'module':module,'entry_point':'skyVS'},fragment={'module':module,'entry_point':'skyFS','targets':[{'format':'rgba8unorm'}]},depth_stencil={'format':'depth24plus','depth_write_enabled':False,'depth_compare':'always'})
sp=d.create_render_pipeline(layout='auto',vertex={'module':sm,'entry_point':'vs','buffers':[{'array_stride':40,'attributes':[{'shader_location':0,'offset':0,'format':'float32x3'}]}]},primitive={'cull_mode':'none'},depth_stencil={'format':'depth32float','depth_write_enabled':True,'depth_compare':'less','depth_bias':2,'depth_bias_slope_scale':2})
sb=d.create_bind_group(layout=sp.get_bind_group_layout(0),entries=[{'binding':0,'resource':{'buffer':ub}}])
e=d.create_command_encoder();p=e.begin_render_pass(color_attachments=[],depth_stencil_attachment={'view':sv,'depth_clear_value':1,'depth_load_op':'clear','depth_store_op':'store'});p.set_pipeline(sp);p.set_bind_group(0,sb);p.set_vertex_buffer(0,vb);p.draw(len(vdata)//40);p.end()
p=e.begin_render_pass(color_attachments=[{'view':color.create_view(),'clear_value':(0,0,0,1),'load_op':'clear','store_op':'store'}],depth_stencil_attachment={'view':depth.create_view(),'depth_clear_value':1,'depth_load_op':'clear','depth_store_op':'store'});p.set_pipeline(skyp);p.set_bind_group(0,bind);p.draw(3);p.set_pipeline(pipeline);p.set_vertex_buffer(0,vb);p.draw(len(vdata)//40);p.end();t=time.perf_counter();d.queue.submit([e.finish()]);data=d.queue.read_texture({'texture':color},{'offset':0,'bytes_per_row':5888,'rows_per_image':900},(1440,900,1));print('RENDER PASS COMPLETE',round(time.perf_counter()-t,3),flush=True);raw=bytes(data);packed=b''.join(raw[y*5888:y*5888+5760] for y in range(900));Image.frombytes('RGBA',(1440,900),packed).save(out/'native-render.png');print('PASS: WGSL compilation, shadow pass, sky pass, world pass, texture readback',flush=True)
# Verify flashlight changes the actual rendered output, using identical geometry/camera.
import struct
uf=list(struct.unpack('84f',udata));uf[39]=1.;d.queue.write_buffer(ub,0,struct.pack('84f',*uf))
e=d.create_command_encoder();p=e.begin_render_pass(color_attachments=[{'view':color.create_view(),'clear_value':(0,0,0,1),'load_op':'clear','store_op':'store'}],depth_stencil_attachment={'view':depth.create_view(),'depth_clear_value':1,'depth_load_op':'clear','depth_store_op':'store'});p.set_pipeline(skyp);p.set_bind_group(0,bind);p.draw(3);p.set_pipeline(pipeline);p.set_vertex_buffer(0,vb);p.draw(len(vdata)//40);p.end();d.queue.submit([e.finish()]);raw2=bytes(d.queue.read_texture({'texture':color},{'offset':0,'bytes_per_row':5888,'rows_per_image':900},(1440,900,1)));packed2=b''.join(raw2[y*5888:y*5888+5760] for y in range(900));change=sum(abs(a-b) for a,b in zip(packed,packed2))/len(packed);assert change>1,change
Image.frombytes('RGBA',(1440,900),packed2).save(out/'native-flashlight.png');print('PASS: flashlight changes rendered image; mean RGBA difference',round(change,3))
