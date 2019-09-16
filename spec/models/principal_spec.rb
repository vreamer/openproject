#-- copyright
# OpenProject is a project management system.
# Copyright (C) 2012-2018 the OpenProject Foundation (OPF)
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2017 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See docs/COPYRIGHT.rdoc for more details.
#++

require 'spec_helper'

describe Principal, type: :model do
  let(:user) { FactoryBot.build(:user) }
  let(:group) { FactoryBot.build(:group) }

  def self.should_return_groups_and_users_if_active(method, *params)
    it 'should return a user' do
      user.save!

      expect(Principal.send(method, *params).where(id: user.id)).to eq([user])
    end

    it 'should return a group' do
      group.save!

      expect(Principal.send(method, *params).where(id: group.id)).to eq([group])
    end

    it 'should not return the anonymous user' do
      User.anonymous

      expect(Principal.send(method, *params).where(id: user.id)).to eq([])
    end

    it 'should not return an inactive user' do
      user.status = User::STATUSES[:locked]

      user.save!

      expect(Principal.send(method, *params).where(id: user.id).to_a).to eq([])
    end
  end

  describe 'active' do
    should_return_groups_and_users_if_active(:active_or_registered)

    it 'should not return a registerd user' do
      user.status = User::STATUSES[:registered]

      user.save!

      expect(Principal.active.where(id: user.id)).to eq([])
    end
  end

  describe 'active_or_registered' do
    should_return_groups_and_users_if_active(:active_or_registered)

    it 'should return a registerd user' do
      user.status = User::STATUSES[:registered]

      user.save!

      expect(Principal.active_or_registered.where(id: user.id)).to eq([user])
    end
  end

  describe 'active_or_registered_like' do
    def self.search
      'blubs'
    end

    let(:search) { self.class.search }

    before do
      user.lastname = search
      group.lastname = search
    end

    should_return_groups_and_users_if_active(:active_or_registered_like, search)

    it 'should return a registerd user' do
      user.status = User::STATUSES[:registered]

      user.save!

      expect(Principal.active_or_registered_like(search).where(id: user.id)).to eq([user])
    end

    it 'should not return a user if the name does not match' do
      user.save!

      expect(Principal.active_or_registered_like(user.lastname + '123').to_a).not_to include(user)
    end

    it 'should return a group if the name does match partially' do
      user.save!

      expect(Principal.active_or_registered_like(user.lastname[0, -1]).to_a).to include(user)
    end
  end
end
