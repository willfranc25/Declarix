import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ZoomableImage } from './ImageViewer';

describe('receipt image navigation',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const decodeGate=()=>{
  const pending=[];
  vi.stubGlobal('Image',class {src='';decode(){return new Promise((resolve,reject)=>pending.push({resolve,reject,src:this.src}));}});
  return pending;
 };
 it('keeps visible pixels and user zoom until the sharper image is decoded',async()=>{
  const pending=decodeGate();
  const {rerender}=render(<ZoomableImage src="/small.jpg"/>);
  const image=screen.getByAltText('Comprobante');fireEvent.load(image);
  fireEvent.click(screen.getByRole('button',{name:'Acercar'}));
  rerender(<ZoomableImage src="/small.jpg" upgradeSrc="/detail.jpg"/>);
  expect(image).toHaveAttribute('src','/small.jpg');expect(image).toHaveStyle({visibility:'visible'});
  expect(screen.getByText('130%')).toBeInTheDocument();
  expect(screen.queryByText('Cargando imagen…')).toBeNull();
  await act(async()=>pending[0].resolve());
  await waitFor(()=>expect(image).toHaveAttribute('src','/detail.jpg'));
  fireEvent.load(image);expect(screen.getByText('130%')).toBeInTheDocument();
  expect(image).toHaveStyle({visibility:'visible'});
 });
 it('keeps the photo visible when detail decoding fails',async()=>{
  const pending=decodeGate();render(<ZoomableImage src="/small.jpg" upgradeSrc="/broken.jpg"/>);
  const image=screen.getByAltText('Comprobante');fireEvent.load(image);
  await act(async()=>pending[0].reject(new Error('bad image')));
  expect(image).toHaveAttribute('src','/small.jpg');expect(image).toHaveStyle({visibility:'visible'});
  expect(screen.getByRole('status')).toHaveTextContent('Se mantiene la vista previa');
 });
 it('ignores a late upgrade after switching to another receipt',async()=>{
  const pending=decodeGate();const {rerender}=render(<ZoomableImage src="/first.jpg" upgradeSrc="/detail-first.jpg"/>);
  fireEvent.load(screen.getByAltText('Comprobante'));
  rerender(<ZoomableImage src="/second.jpg"/>);
  await act(async()=>pending[0].resolve());
  expect(screen.getByAltText('Comprobante')).toHaveAttribute('src','/second.jpg');
 });
 it('replaces the image immediately and hides old pixels until the current image loads',()=>{
  const {rerender}=render(<ZoomableImage src="/first.jpg" alt="Primera boleta"/>);
  const first=screen.getByAltText('Primera boleta');
  fireEvent.load(first);expect(first).toHaveStyle({visibility:'visible'});
  fireEvent.click(screen.getByRole('button',{name:'Acercar'}));
  rerender(<ZoomableImage src="/next.jpg" alt="Segunda boleta"/>);
  const next=screen.getByAltText('Segunda boleta');
  expect(next).not.toBe(first);expect(first.isConnected).toBe(false);
  expect(next).toHaveAttribute('src','/next.jpg');expect(next).toHaveStyle({visibility:'hidden'});
  expect(screen.getByRole('status')).toHaveTextContent('Cargando imagen');
  expect(screen.getByText('100%')).toBeInTheDocument();
  fireEvent.load(first);expect(next).toHaveStyle({visibility:'hidden'});
  fireEvent.load(next);expect(next).toHaveStyle({visibility:'visible'});
  expect(screen.queryByRole('status')).toBeNull();
 });
});
