import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { badgeVariants } from './badgeVariants';
import { Button } from './button';
import { buttonVariants } from './buttonVariants';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';
import { ScrollArea } from './scroll-area';
import { Select, SelectTrigger, SelectValue } from './select';
import { signalBadgeVariants } from './signalBadgeVariants';
import { Skeleton } from './skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { Tooltip, TooltipProvider, TooltipTrigger } from './tooltip';

// Phase D render-smoke: each shadcn primitive mounts and shows its content.
describe('ui primitives smoke', () => {
  afterEach(() => cleanup());

  it('variant helpers return class strings', () => {
    expect(typeof badgeVariants({ variant: 'outline' })).toBe('string');
    expect(typeof buttonVariants({ variant: 'ghost', size: 'sm' })).toBe('string');
    expect(typeof signalBadgeVariants({})).toBe('string');
  });

  it('renders badge and button', () => {
    render(<Badge variant="outline">LIVE</Badge>);
    render(<Button disabled>RUN</Button>);

    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RUN' }).disabled).toBe(true);
  });

  it('renders the card composition', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    for (const text of ['Title', 'Description', 'Body', 'Footer']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('renders input and skeleton', () => {
    render(<Input placeholder="TICKER" />);
    const { container } = render(<Skeleton className="h-2" />);

    const input = screen.getByPlaceholderText('TICKER');
    fireEvent.change(input, { target: { value: 'AAPL' } });
    expect(input.value).toBe('AAPL');
    expect(container.firstChild.className).toContain('animate-pulse');
  });

  it('renders a table', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>AAPL</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('AAPL')).toBeTruthy();
  });

  it('renders tabs with the default panel active', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">first panel</TabsContent>
        <TabsContent value="two">second panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('first panel')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'One' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Two' }).getAttribute('aria-selected')).toBe('false');
  });

  it('renders an open dialog', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm</DialogTitle>
            <DialogDescription>Are you sure?</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Confirm')).toBeTruthy();
    expect(screen.getByText('Are you sure?')).toBeTruthy();
  });

  it('renders select trigger, tooltip trigger, and scroll area', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    );
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>hover me</TooltipTrigger>
        </Tooltip>
      </TooltipProvider>
    );
    render(<ScrollArea>scrollable content</ScrollArea>);

    expect(screen.getByText('Pick one')).toBeTruthy();
    expect(screen.getByText('hover me')).toBeTruthy();
    expect(screen.getByText('scrollable content')).toBeTruthy();
  });
});
