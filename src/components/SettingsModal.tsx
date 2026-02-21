import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Key, Trash2, Save, X } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadApiKey()
    }
  }, [isOpen])

  const loadApiKey = async () => {
    try {
      const key = await invoke<string | null>('get_api_key')
      setHasKey(!!key)
      setApiKey('') // Don't show the actual key
    } catch (error) {
      console.error('Failed to load API key:', error)
    }
  }

  const saveKey = async () => {
    if (!apiKey.trim()) {
      setMessage('Please enter an API key')
      return
    }
    
    try {
      await invoke('save_api_key', { apiKey: apiKey.trim() })
      setHasKey(true)
      setApiKey('')
      setMessage('API key saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(`Failed to save: ${error}`)
    }
  }

  const deleteKey = async () => {
    try {
      await invoke('delete_api_key')
      setHasKey(false)
      setApiKey('')
      setMessage('API key deleted')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(`Failed to delete: ${error}`)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 w-96 border border-dark-600">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Key size={20} className="text-blue-400" />
            Settings
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? '••••••••••••••••' : 'Enter your API key'}
              className="w-full px-3 py-2 bg-dark-700 rounded border border-dark-600 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Stored securely in system keychain
            </p>
          </div>

          {message && (
            <div className={`text-sm ${message.includes('success') || message.includes('deleted') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={saveKey}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-500 transition-colors"
            >
              <Save size={16} />
              Save
            </button>
            {hasKey && (
              <button
                onClick={deleteKey}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-dark-600">
          <h3 className="text-sm font-medium text-gray-300 mb-2">How to get API key:</h3>
          <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1">
            <li>Go to <a href="https://console.anthropic.com" target="_blank" rel="noopener" className="text-blue-400 hover:underline">console.anthropic.com</a></li>
            <li>Sign in or create an account</li>
            <li>Go to "API keys" section</li>
            <li>Create a new key and copy it</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
