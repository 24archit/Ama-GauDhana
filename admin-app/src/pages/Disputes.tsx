import { useEffect, useState, useCallback } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TablePagination, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel, CircularProgress
} from '@mui/material';
import axios from 'axios';

import { API_BASE } from '@ama-gau-dhana/shared';

export default function Disputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<any>(null);
  const [resolutionStatus, setResolutionStatus] = useState('resolved');
  const [assignedFarmerId, setAssignedFarmerId] = useState('');

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/disputes`, {
        params: { page: page + 1, limit: rowsPerPage }
      });
      if (res.data.success) {
        setDisputes(res.data.data);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error("Failed to fetch disputes", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, rowsPerPage]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const handleResolveSubmit = async () => {
    if (!selectedDispute) return;
    try {
      await axios.patch(`${API_BASE}/api/admin/disputes/${selectedDispute._id}/resolve`, {
        resolutionStatus,
        assignedFarmerId: resolutionStatus === 'resolved' ? assignedFarmerId : undefined
      });
      setResolveOpen(false);
      
      // Snapshot optimization: update local state instead of refetching the whole list
      setDisputes(prev => prev.map(dispute => 
        dispute._id === selectedDispute._id 
          ? { ...dispute, status: resolutionStatus } 
          : dispute
      ));
    } catch (err) {
      console.error("Failed to resolve dispute", err);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
        Dispute Management
      </Typography>

      <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 1, mt: 3 }}>
        <TableContainer sx={{ maxHeight: '70vh' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell><b>Cow Info</b></TableCell>
                <TableCell><b>Original Farmer</b></TableCell>
                <TableCell><b>Attempting Farmer</b></TableCell>
                <TableCell><b>Reason</b></TableCell>
                <TableCell><b>Status</b></TableCell>
                <TableCell><b>Action</b></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {disputes.map((dispute) => (
                <TableRow hover key={dispute._id}>
                  <TableCell>
                    {dispute.cattleId?.name || 'Unknown'} <br/>
                    <Typography variant="caption" color="textSecondary">{dispute.cattleId?.tagNumber}</Typography>
                  </TableCell>
                  <TableCell>
                    {dispute.originalFarmerId?.name} <br/>
                    <Typography variant="caption">{dispute.originalFarmerId?.contact?.phone}</Typography>
                  </TableCell>
                  <TableCell>
                    {dispute.attemptingFarmerId?.name} <br/>
                    <Typography variant="caption">{dispute.attemptingFarmerId?.contact?.phone}</Typography>
                  </TableCell>
                  <TableCell>{dispute.reason}</TableCell>
                  <TableCell>
                    <Chip 
                      label={dispute.status.toUpperCase()} 
                      color={dispute.status === 'resolved' ? 'success' : (dispute.status === 'pending' ? 'warning' : 'error')} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>
                    {dispute.status === 'pending' && (
                      <Button size="small" variant="contained" onClick={() => {
                        setSelectedDispute(dispute);
                        setAssignedFarmerId(dispute.originalFarmerId?._id);
                        setResolveOpen(true);
                      }}>
                        Review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {disputes.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">No disputes found.</TableCell>
                </TableRow>
              )}
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={40} />
                    <Typography variant="body2" sx={{ mt: 1 }} color="textSecondary">Loading disputes...</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50]}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        />
      </Paper>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onClose={() => setResolveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Resolve Ownership Dispute</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Review the registration attempt and determine the rightful owner of the cow.
          </Typography>
          
          <FormControl fullWidth margin="normal">
            <InputLabel>Resolution Status</InputLabel>
            <Select
              value={resolutionStatus}
              label="Resolution Status"
              onChange={(e) => setResolutionStatus(e.target.value)}
            >
              <MenuItem value="resolved">Resolved (Assign Owner)</MenuItem>
              <MenuItem value="rejected">Rejected (Discard Attempt)</MenuItem>
            </Select>
          </FormControl>

          {resolutionStatus === 'resolved' && (
            <FormControl fullWidth margin="normal">
              <InputLabel>Assign Cow To</InputLabel>
              <Select
                value={assignedFarmerId}
                label="Assign Cow To"
                onChange={(e) => setAssignedFarmerId(e.target.value)}
              >
                <MenuItem value={selectedDispute?.originalFarmerId?._id}>
                  Original: {selectedDispute?.originalFarmerId?.name} ({selectedDispute?.originalFarmerId?.contact?.phone})
                </MenuItem>
                <MenuItem value={selectedDispute?.attemptingFarmerId?._id}>
                  Attempting: {selectedDispute?.attemptingFarmerId?.name} ({selectedDispute?.attemptingFarmerId?.contact?.phone})
                </MenuItem>
              </Select>
            </FormControl>
          )}

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveOpen(false)}>Cancel</Button>
          <Button variant="contained" color="primary" onClick={handleResolveSubmit}>Confirm Resolution</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
