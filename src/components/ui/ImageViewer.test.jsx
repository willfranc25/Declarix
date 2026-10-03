import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ZoomableImage } from './ImageViewer';

describe('receipt image navigation',()=>{
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
